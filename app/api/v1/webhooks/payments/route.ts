import { NextRequest, NextResponse } from 'next/server';
import { processRazorpayWebhook } from '@/services/payments';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const razorpaySignature = req.headers.get('x-razorpay-signature');
  if (razorpaySignature) {
    try {
      const rawBody = await req.text();
      const result = await processRazorpayWebhook(rawBody, razorpaySignature);
      return NextResponse.json(result, { status: 200 });
    } catch (err: any) {
      return NextResponse.json(
        { error: { code: err.code || 'WEBHOOK_FAILED', message: err.message } },
        { status: err.statusCode || 400 }
      );
    }
  }

  return NextResponse.json({ received: true, provider: 'generic' }, { status: 200 });
}
