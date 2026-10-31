import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { suggestCrewsForOrder } from '@/services/scheduling';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'OPERATIONS', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const orderId = parts[parts.indexOf('orders') + 1];
    const dateParam = url.searchParams.get('date') || undefined;

    const result = await suggestCrewsForOrder(orderId, dateParam);
    return NextResponse.json(result);
  }
);

