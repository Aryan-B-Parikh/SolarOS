import { NextRequest, NextResponse } from 'next/server';
import { reconcileAllStockLedgers } from '@/services/inventory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const result = await reconcileAllStockLedgers();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}

