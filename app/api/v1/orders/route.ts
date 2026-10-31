import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getOrders } from '@/services/orders';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as any;
    const customerId = searchParams.get('customerId') || undefined;

    const orders = await getOrders({ status, customerId });
    return NextResponse.json({ orders });
  }
);
