import { NextRequest, NextResponse } from 'next/server';
import { reconcileAllStockLedgers, reconcileStockLedger } from '@/services/inventory';
import { createApiHandler } from '@/lib/handler';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const productId = url.searchParams.get('productId');
    const locationId = url.searchParams.get('locationId');

    if (productId && locationId) {
      const single = await reconcileStockLedger(productId, locationId);
      return NextResponse.json(single);
    }

    const all = await reconcileAllStockLedgers();
    return NextResponse.json(all);
  }
);

