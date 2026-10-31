import { NextRequest, NextResponse } from 'next/server';
import { flagStaleLeads } from '@/services/leads';

/**
 * Stale-lead SLA cron (FR-1.6 / AUTO-8).
 *
 * Scans NEW leads past the 4 business-hour first-contact SLA and queues
 * STALE_LEAD_ALERT emails to the owning sales rep and the DIRECTOR(s).
 *
 * Protected by the CRON_SECRET shared secret (header `x-cron-secret`
 * or `Authorization: Bearer <secret>`), mirroring the maintenance cron.
 * Notifications are idempotent per lead per IST day, so this can safely
 * run every 15-30 minutes.
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
    const nowParam = url.searchParams.get('now');
    const now = nowParam ? new Date(nowParam) : new Date();

    const result = await flagStaleLeads(now);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'LEAD_SLA_CRON_FAILED', message: error?.message || 'Leads SLA cron failed' } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
