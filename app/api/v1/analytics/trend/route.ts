import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getRevenueTrend } from '@/services/analytics';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const monthsBack = url.searchParams.get('months') ? parseInt(url.searchParams.get('months')!, 10) : 6;
    const trend = await getRevenueTrend(monthsBack);
    return NextResponse.json(trend);
  }
);

