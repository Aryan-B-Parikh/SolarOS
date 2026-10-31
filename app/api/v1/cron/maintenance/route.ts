import { NextRequest, NextResponse } from 'next/server';
import { runMaintenanceJob } from '@/services/maintenance';

/**
 * Daily predictive-maintenance cron (AUTO-9).
 * Protected by the CRON_SECRET shared secret (header `x-cron-secret`
 * or `Authorization: Bearer <secret>`).
 */
function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when unconfigured
  const header = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization');
  const provided = header || (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null);
  return !!provided && provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Missing or invalid cron secret' } },
      { status: 401 }
    );
  }
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const referenceDate = dateParam ? new Date(dateParam) : new Date();

    const result = await runMaintenanceJob(referenceDate);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'CRON_MAINTENANCE_FAILED', message: error.message || 'Maintenance cron failed' } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
