import { NextRequest, NextResponse } from 'next/server';
import { processOutboxQueue } from '@/services/outbox-worker';

export async function POST(req: NextRequest) {
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

