import { NextRequest, NextResponse } from 'next/server'
import { errorBody } from '@/lib/errors'
import { requestId } from '@/lib/api'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { handleRazorpayWebhook } from '@/services/portal-payments'

// T2: Razorpay webhook endpoint — an external caller, so no cookie/token auth.
// Deliberately NOT wrapped in handler(): the RAW body must be read before any
// JSON parsing so the X-Razorpay-Signature HMAC covers the exact bytes sent.
// After the signature check, payment.captured events are recorded through the
// same idempotent path as the portal verify route (key `rzp_<payment_id>`).
export async function POST(req: NextRequest) {
  const rid = requestId()
  try {
    const raw = await req.text()
    const signature = req.headers.get('x-razorpay-signature') ?? ''
    if (!verifyWebhookSignature(raw, signature)) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Webhook signature mismatch.', details: null, requestId: rid } },
        { status: 400 }
      )
    }
    const result = await handleRazorpayWebhook(raw)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api:${rid}]`, err)
    return NextResponse.json(errorBody(err, rid), { status: 500 })
  }
}
