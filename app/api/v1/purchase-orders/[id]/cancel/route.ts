import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { cancelPurchaseOrder } from '@/services/purchasing';

const CancelPOSchema = z.object({
  reason: z.string().min(3, 'A cancellation reason is required'),
});

/** Cancels a DRAFT/OPEN/PARTIAL purchase order (FR-5.8). */
export const POST = createApiHandler(
  {
    bodySchema: CancelPOSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const poId = parts[parts.indexOf('purchase-orders') + 1];

    const result = await cancelPurchaseOrder(poId, body.reason, user?.id);
    return NextResponse.json(result);
  }
);
