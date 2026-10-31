import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getProjectProfitabilityList } from '@/services/analytics';
import { AnalyticsPeriodSchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get('period');
    const parsedPeriod = rawPeriod ? AnalyticsPeriodSchema.safeParse(rawPeriod) : null;
    const period = parsedPeriod?.success ? parsedPeriod.data : undefined;

    const customStart = url.searchParams.get('customStart') || undefined;
    const customEnd = url.searchParams.get('customEnd') || undefined;
    const isLossOnly = url.searchParams.get('isLossOnly') === 'true';
    const status = url.searchParams.get('status') || undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;

    const list = await getProjectProfitabilityList({
      period,
      customStart,
      customEnd,
      isLossOnly,
      status,
      limit,
    });

    // Format BigInt values to string for JSON serialization
    const serialized = list.map((p) => ({
      ...p,
      netRevenuePaise: p.netRevenuePaise.toString(),
      materialsPaise: p.materialsPaise.toString(),
      labourPaise: p.labourPaise.toString(),
      expensesPaise: p.expensesPaise.toString(),
      installProfitPaise: p.installProfitPaise.toString(),
    }));

    return NextResponse.json(serialized);
  }
);

