import { NextRequest, NextResponse } from 'next/server';
import { verifyDashboardShareToken, getKpiMetrics, getRevenueTrend } from '@/services/analytics';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { period, expiresAt } = verifyDashboardShareToken(token);

    const [kpis, trend] = await Promise.all([
      getKpiMetrics(period),
      getRevenueTrend(6),
    ]);

    return NextResponse.json({
      readOnly: true,
      period,
      expiresAt: expiresAt.toISOString(),
      kpis,
      trend,
    });
  } catch (err: unknown) {
    const errRes = formatErrorResponse(err);
    return NextResponse.json(errRes.body, { status: errRes.status });
  }
}

