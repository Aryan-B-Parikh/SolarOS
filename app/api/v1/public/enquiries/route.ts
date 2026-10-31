import { NextRequest, NextResponse } from 'next/server';
import { CreateEnquirySchema } from '@/contracts';
import prisma from '@/lib/db';
import { generateAccessToken } from '@/lib/access-links';
import { createOutboxNotification } from '@/lib/outbox';
import { logger } from '@/lib/logger';

// In-memory IP rate limiter: 5 requests per minute per IP (TRD 2.6)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return false;
  }

  if (record.count >= 5) {
    return true;
  }

  record.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many enquiry submissions. Please wait 1 minute.' } },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.json();

    // 1. Zod contract validation
    const parse = CreateEnquirySchema.safeParse(rawBody);
    if (!parse.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Invalid enquiry submission', details: parse.error.format() } },
        { status: 400 }
      );
    }

    const data = parse.data;

    // 2. Honeypot bot protection
    if (data.honeypot && data.honeypot.length > 0) {
      logger.warn('Honeypot bot submission caught', { ip: clientIp });
      return NextResponse.json({ success: true, leadNumber: 'SP-LEAD-BOT' }); // Silent sink
    }

    // 3. Match or create customer by phone (E.164)
    const normalizedPhone = data.phone.trim();
    let customer = await prisma.customer.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!customer) {
      const customerCount = await prisma.customer.count();
      const customerNumber = `CUST-${String(customerCount + 1).padStart(5, '0')}`;

      customer = await prisma.customer.create({
        data: {
          customer_number: customerNumber,
          name: data.name.trim(),
          phone: normalizedPhone,
          email: data.email || null,
          address: data.address.trim(),
          address_line2: data.addressLine2 || null,
          city: data.city || 'Ahmedabad',
          state: data.state || 'Gujarat',
          pincode: data.pincode,
          consent_at: new Date(),
        },
      });
    }

    // 4. Create Lead
    const leadCount = await prisma.lead.count();
    const leadNumber = `LD-${new Date().getFullYear()}-${String(leadCount + 1).padStart(4, '0')}`;

    // SLA Due in 2 hours for follow-up
    const slaDueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const lead = await prisma.lead.create({
      data: {
        lead_number: leadNumber,
        customer_id: customer.id,
        source: 'WEB_FORM',
        status: 'NEW',
        sla_due_at: slaDueAt,
        system_type_pref: data.systemTypePref || 'ON_GRID',
        requested_capacity_kw: data.requestedCapacityKw || null,
        monthly_bill_rupees: data.monthlyBillRupees || null,
        wants_subsidy: data.wantsSubsidy,
      },
    });

    // 5. Generate secure 90-day portal access link
    const { rawToken, tokenHash, expiresAt } = generateAccessToken('PORTAL');

    await prisma.customerAccessLink.create({
      data: {
        customer_id: customer.id,
        scope: 'PORTAL',
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal/${rawToken}`;

    // 6. Queue confirmation message in outbox
    await createOutboxNotification(
      prisma,
      'ENQUIRY_CONFIRMATION',
      {
        customerId: customer.id,
        leadNumber: lead.lead_number,
        phone: customer.phone,
        portalUrl,
      },
      lead.id
    );

    logger.info('Public enquiry successfully received and lead created', {
      leadNumber: lead.lead_number,
      customerId: customer.id,
    });

    return NextResponse.json({
      success: true,
      leadNumber: lead.lead_number,
      portalUrl,
      rawToken,
      message: 'Your solar enquiry has been received. Our team will contact you shortly.',
    });
  } catch (err: any) {
    logger.error('Failed to create public enquiry', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to submit enquiry at this time' } },
      { status: 500 }
    );
  }
}

