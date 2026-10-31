import { NextRequest, NextResponse } from 'next/server';
import { processOutboxQueue } from '@/services/outbox-worker';

/**
 * Outbox delivery worker cron (AUTO-10).
 * Protected by the CRON_SECRET shared secret.
 */
function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
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
    const result = await processOutboxQueue(25);
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'CRON_OUTBOX_FAILED', message: error.message || 'Outbox processing failed' } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
