import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { portalPayVerify } from '@/services/portal-payments'

// T2: confirm an online payment — Razorpay Checkout's handler posts the
// order/payment ids and signature here; the signature is verified against the
// key secret before anything is recorded. Returns the refreshed payment
// summary for the order.
const verifySchema = z.object({
  token: z.string().min(10).max(200),
  orderId: z.string().min(6).max(64),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,}$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,}$/),
  razorpay_signature: z.string().min(16).max(512),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, verifySchema, async ({ body }) => {
    return await portalPayVerify(body.token, body.orderId, {
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
    })
  })
}
