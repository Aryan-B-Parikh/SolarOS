import { NextRequest, NextResponse } from 'next/server';
import { processRazorpayWebhook } from '@/services/payments';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-razorpay-signature') || '';
    const rawBody = await req.text();

    const result = await processRazorpayWebhook(rawBody, signature);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    const status = error.statusCode || 400;
    return NextResponse.json(
      { error: { code: error.code || 'WEBHOOK_FAILED', message: error.message || 'Webhook processing failed' } },
      { status }
    );
  }
}

