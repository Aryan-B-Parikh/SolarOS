import { NextRequest, NextResponse } from 'next/server';
import { runMaintenanceJob } from '@/services/maintenance';

export async function POST(req: NextRequest) {
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

