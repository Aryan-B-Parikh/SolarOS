import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getTechnicianPaySummary } from '@/services/analytics';
import { AnalyticsPeriodSchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get('period') || 'THIS_MONTH';
    const parsed = AnalyticsPeriodSchema.safeParse(rawPeriod);
    const period = parsed.success ? parsed.data : 'THIS_MONTH';

    const paySummary = await getTechnicianPaySummary(period);
    return NextResponse.json(paySummary);
  }
);

