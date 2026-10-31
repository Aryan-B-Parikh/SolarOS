import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getAnalyticsSummary } from '@/services/analytics';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async () => {
    const summary = await getAnalyticsSummary();
    return NextResponse.json(summary);
  }
);

