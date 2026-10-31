import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { generateAccessToken } from '@/lib/access-links';
import { queueNotification } from '@/lib/outbox';
import { logger } from '@/lib/logger';

const RequestLinkSchema = z.object({
  contact: z.string().min(5, 'Phone number or email required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parse = RequestLinkSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Valid phone number or email required' } },
        { status: 400 }
      );
    }

    const { contact } = parse.data;
    const cleanPhone = contact.replace(/\D/g, '');

    // Uniform response message to prevent account enumeration (TRD 2.6)
    const uniformResponse = {
      success: true,
      message: 'If the provided phone or email is registered with SunPower, a fresh secure access link has been dispatched.',
    };

    // Lookup customer by normalized phone or email
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone: { contains: cleanPhone.slice(-10) } },
          { email: contact.trim().toLowerCase() },
        ],
      },
    });

    if (!customer) {
      // Return uniform message without error
      return NextResponse.json(uniformResponse);
    }

    // Generate fresh 90-day PORTAL access link
    const { rawToken, tokenHash, expiresAt } = generateAccessToken('PORTAL');

    await prisma.customerAccessLink.create({
      data: {
        customer_id: customer.id,
        scope: 'PORTAL',
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    // Queue notification in transactional outbox
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal/${rawToken}`;
    const recipient = customer.phone || customer.email;
    if (recipient) {
      await queueNotification({
        channel: customer.phone ? 'SMS' : 'EMAIL',
        recipient,
        template: 'PORTAL_LINK_DISPATCHED',
        payload: {
          customerId: customer.id,
          phone: customer.phone,
          email: customer.email,
          portalUrl,
          expiresAt: expiresAt.toISOString(),
        },
        // Stable key: re-requesting the same link must not send twice
        idempotencyKey: `portal-link:${customer.id}:${tokenHash}`,
      });
    }

    logger.info('Dispatched fresh portal access link to customer', {
      customerId: customer.id,
    });

    return NextResponse.json(uniformResponse);
  } catch (err: any) {
    logger.error('Portal link request failed', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to process request at this time' } },
      { status: 500 }
    );
  }
}

