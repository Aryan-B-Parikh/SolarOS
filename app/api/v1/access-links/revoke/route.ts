import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { z } from 'zod';
import prisma from '@/lib/db';
import { recordAudit } from '@/lib/audit';

/**
 * Staff-initiated revocation of customer access links (D11 / X-SEC-LINKS).
 * Revoked links stop working immediately, even if unexpired.
 */
const RevokeLinksSchema = z.object({
  customerId: z.string().uuid(),
  scope: z.enum(['PORTAL', 'QUOTE', 'CERTIFICATE']).optional(),
});

export const POST = createApiHandler(
  {
    bodySchema: RevokeLinksSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT'],
  },
  async ({ body, user }) => {
    const revoked = await prisma.customerAccessLink.updateMany({
      where: {
        customer_id: body.customerId,
        ...(body.scope ? { scope: body.scope } : {}),
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user?.id,
      entityType: 'customer_access_link',
      entityId: body.customerId,
      action: 'REVOKE_LINKS',
      after: { count: revoked.count, scope: body.scope || 'ALL' },
    });

    return NextResponse.json({ success: true, revokedCount: revoked.count });
  }
);
