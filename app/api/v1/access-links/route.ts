import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { z } from 'zod';
import prisma from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { generateAccessToken } from '@/lib/access-links';
import { queueNotification } from '@/lib/outbox';

const IssueLinkSchema = z.object({
  customerId: z.string().uuid(),
  scope: z.enum(['PORTAL', 'QUOTE', 'CERTIFICATE']).default('PORTAL'),
  quoteValidityDays: z.number().int().positive().optional(),
  channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']).optional(),
});

export const POST = createApiHandler(
  {
    bodySchema: IssueLinkSchema,
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT'],
  },
  async ({ body, user }) => {
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
        { status: 404 }
      );
    }

    const tokenInfo = generateAccessToken(body.scope, body.quoteValidityDays);

    const link = await prisma.customerAccessLink.create({
      data: {
        customer_id: body.customerId,
        scope: body.scope,
        token_hash: tokenInfo.tokenHash,
        expires_at: tokenInfo.expiresAt,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '';
    const pathPrefix = body.scope === 'PORTAL' ? '/portal' : body.scope === 'QUOTE' ? '/q' : '/certificate';
    const relativeUrl = `${pathPrefix}/${tokenInfo.rawToken}`;
    const fullUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

    if (body.channel && (customer.phone || customer.email)) {
      const recipient = body.channel === 'EMAIL' ? customer.email : customer.phone;
      if (recipient) {
        await queueNotification({
          channel: body.channel,
          recipient,
          template: `${body.scope}_LINK_SENT`,
          payload: {
            customerName: customer.name,
            url: fullUrl,
            message: `Hello ${customer.name}, your ${body.scope.toLowerCase()} link is: ${fullUrl}`,
          },
          idempotencyKey: `link-issue-${link.id}`,
        });
      }
    }

    await recordAudit({
      actorType: 'USER',
      actorId: user?.id,
      entityType: 'customer_access_link',
      entityId: link.id,
      action: 'CUSTOMER_LINK_ISSUED',
      after: {
        customerId: body.customerId,
        scope: body.scope,
        expiresAt: tokenInfo.expiresAt.toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      linkId: link.id,
      rawToken: tokenInfo.rawToken,
      url: relativeUrl,
      fullUrl,
      expiresAt: tokenInfo.expiresAt.toISOString(),
    });
  }
);

