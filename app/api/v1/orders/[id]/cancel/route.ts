import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { cancelOrder } from '@/services/orders';
import { z } from 'zod';

const CancelOrderSchema = z.object({
  reason: z.string().min(3, 'A cancellation reason is required'),
});

export const POST = createApiHandler(
  {
    bodySchema: CancelOrderSchema,
    allowedRoles: ['DIRECTOR', 'SALES', 'ACCOUNTS'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const orderId = parts[parts.indexOf('orders') + 1];

    const cancelledOrder = await cancelOrder(orderId, body.reason, user?.id);
    return NextResponse.json({ order: cancelledOrder });
  }
);

