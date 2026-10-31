import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getStockOverview } from '@/services/inventory';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'SALES', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || undefined;
    const lowStockOnly = url.searchParams.get('lowStockOnly') === 'true';

    const items = await getStockOverview({ locationId, lowStockOnly });
    return NextResponse.json({ items });
  }
);

