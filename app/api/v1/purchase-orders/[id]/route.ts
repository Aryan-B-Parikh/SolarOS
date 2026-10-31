import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getPurchaseOrder } from '@/services/purchasing';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'OPERATIONS', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const poId = parts[parts.indexOf('purchase-orders') + 1];

    const po = await getPurchaseOrder(poId);
    return NextResponse.json(po);
  }
);
