import { NextRequest, NextResponse } from 'next/server';
import { reconcileAllStockLedgers } from '@/services/inventory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Verify cron secret if present
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // allow internal/dev or bearer
    const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron');
    if (!isVercelCron && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await reconcileAllStockLedgers();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}

