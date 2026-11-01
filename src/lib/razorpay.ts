// Razorpay gateway client (T2): plain fetch against the REST API — no SDK.
// Order creation for the customer portal checkout, plus the two HMAC-SHA256
// signature checks (checkout handler and webhook) that gate every online
// payment we record. Secrets are read from the environment at call time and
// never logged or returned.

import { createHmac, timingSafeEqual } from 'crypto'

const API_BASE = 'https://api.razorpay.com/v1'

export interface RazorpayOrder {
  id: string
  amount: number
  currency: string
  status: string
}

export interface RazorpayPayment {
  id: string
  status: string
  amount: number
  currency: string
  order_id: string | null
}

/** both key id and secret present — online payments can be attempted */
export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

function basicAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID ?? ''
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? ''
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
}

/**
 * Create a gateway order for `amountInPaise` (money is integer paise
 * everywhere in this schema — no rupee conversion needed). `receipt` is our
 * order number, `notes` carry our internal ids so the webhook can resolve the
 * order without a local pending-payment table.
 */
export async function createRazorpayOrder(input: {
  amountInPaise: number
  receipt: string
  notes?: Record<string, string>
}): Promise<RazorpayOrder> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: basicAuthHeader() },
    body: JSON.stringify({
      amount: input.amountInPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes ?? {},
      payment_capture: 1,
    }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${body.slice(0, 200)}`)
  const order = JSON.parse(body) as RazorpayOrder & { receipt?: string }
  return { id: order.id, amount: order.amount, currency: order.currency, status: order.status }
}

/** fetch a payment entity (amount/status/order linkage) — used at verify time */
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: basicAuthHeader() },
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${body.slice(0, 200)}`)
  return JSON.parse(body) as RazorpayPayment
}

/** fetch a gateway order (notes/receipt) — webhook fallback to find our order */
export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder & { receipt?: string; notes?: Record<string, string> }> {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: basicAuthHeader() },
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${body.slice(0, 200)}`)
  return JSON.parse(body)
}

/** constant-time string compare (length mismatch fails fast) */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length === 0 || ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Checkout handler signature: HMAC-SHA256 of "razorpay_order_id|razorpay_payment_id"
 * with the key secret, compared timing-safely against the signature Razorpay
 * handed to the browser.
 */
export function verifyCheckoutSignature(input: {
  razorpayOrderId: string
  razorpayPaymentId: string
  signature: string
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret || !input.signature) return false
  const expected = createHmac('sha256', secret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest('hex')
  return safeEqual(expected, input.signature)
}

/** Webhook signature: HMAC-SHA256 of the RAW request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(expected, signatureHeader)
}
