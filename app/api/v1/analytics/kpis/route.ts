import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getKpiMetrics } from '@/services/analytics';
import { AnalyticsPeriodSchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get('period') || 'THIS_MONTH';
    const parsedPeriod = AnalyticsPeriodSchema.safeParse(rawPeriod);
    const period = parsedPeriod.success ? parsedPeriod.data : 'THIS_MONTH';

    const customStart = url.searchParams.get('customStart') || undefined;
    const customEnd = url.searchParams.get('customEnd') || undefined;

    const kpis = await getKpiMetrics(period, customStart, customEnd);
    return NextResponse.json(kpis);
  }
);

