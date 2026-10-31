import { NextRequest, NextResponse } from 'next/server';
import { CreateEnquirySchema } from '@/contracts';
import { createLead } from '@/services/leads';
import { generateAccessToken, hashToken } from '@/lib/access-links';
import prisma from '@/lib/db';
import { queueNotification } from '@/lib/outbox';
import { logger } from '@/lib/logger';
import { LeadSource } from '@prisma/client';

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

    // 3. Create lead via domain service
    const lead = await createLead({
      name: data.name,
      phone: data.phone,
      email: data.email || undefined,
      address: data.address,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      source: LeadSource.WEB,
      requestedCapacityKw: data.requestedCapacityKw,
      systemTypePref: data.systemTypePref as any,
      wantsSubsidy: data.wantsSubsidy,
      monthlyBillRupees: data.monthlyBillRupees,
    });

    // 4. Issue customer portal token
    let rawToken: string;
    let tokenHash: string;
    let expiresAt: Date;

    const tokenRes = generateAccessToken('PORTAL' as any);
    if (typeof tokenRes === 'string') {
      rawToken = tokenRes;
      tokenHash = hashToken(rawToken);
      expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    } else {
      rawToken = tokenRes.rawToken;
      tokenHash = tokenRes.tokenHash;
      expiresAt = tokenRes.expiresAt;
    }

    await prisma.customerAccessLink.create({
      data: {
        customer_id: lead.customer_id,
        scope: 'PORTAL',
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    const portalUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/portal/${rawToken}`;

    // 5. Transactional outbox notification
    await queueNotification({
      channel: 'SMS',
      recipient: data.phone,
      template: 'ENQUIRY_CONFIRMATION',
      payload: {
        leadNumber: lead.lead_number,
        portalUrl,
      },
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
      { error: { code: 'INTERNAL_ERROR', message: err?.message || 'Unable to submit enquiry at this time' } },
      { status: 500 }
    );
  }
}
