import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getOrderById } from '@/services/orders';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.indexOf('orders') + 1];

    const order = await getOrderById(id);
    return NextResponse.json({ order });
  }
);

