import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { confirmOrder } from '@/services/orders';

export const POST = createApiHandler(
  {
    allowedRoles: ['DIRECTOR'],
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const orderId = parts[parts.indexOf('orders') + 1];

    const order = await confirmOrder(orderId, user?.id);
    return NextResponse.json({ order });
  }
);

