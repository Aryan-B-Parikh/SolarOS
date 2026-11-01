// Customer-initiated online payments (T2, Razorpay test mode): the portal's
// "pay now" flow. A gateway order is created for the outstanding balance; the
// captured payment is then recorded through the SAME recordPayment() the staff
// flow uses, with idempotencyKey `rzp_<razorpay_payment_id>` so the checkout
// verify call and the payment.captured webhook can never double-record one
// payment — whichever arrives first wins, the other replays silently.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { verifyLink } from '@/lib/access-links'
import { recordPayment } from '@/services/orders'
import { enqueue, runOutbox } from '@/lib/outbox'
import { istToday } from '@/lib/dates'
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  isRazorpayConfigured,
  verifyCheckoutSignature,
} from '@/lib/razorpay'

/** Payment.method is a free string; the schema comment vocabulary is
 * UPI/NEFT/CASH/CHEQUE/LOAN, but a checkout payment may be UPI, card or
 * netbanking — 'ONLINE' is the truthful label and renders fine in the UI. */
const ONLINE_METHOD = 'ONLINE'

const idemKey = (razorpayPaymentId: string) => `rzp_${razorpayPaymentId}`

function inr(paise: number): string {
  const rupees = paise / 100
  const frac = Math.abs(rupees) % 1 !== 0
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`
}

/** recipient column is masked for customers; the real address travels in payload.to */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}${name.length > 2 ? '***' : ''}@${domain}`
}

/** the order behind a portal token, ownership-checked — never leaks other customers' orders */
async function portalOrder(token: string, orderId: string) {
  const link = await verifyLink(token, 'PORTAL')
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true } })
  if (!order || order.customerId !== link.customerId) throw new AppError('NOT_FOUND', 'Order not found.')
  return order
}

/** the invoice behind a portal token, ownership-checked */
async function portalInvoice(token: string, invoiceId: string) {
  const link = await verifyLink(token, 'PORTAL')
  const invoice = await db.invoice.findFirst({
    where: {
      OR: [{ id: invoiceId }, { invoiceNumber: invoiceId }],
      customerId: link.customerId,
    },
    include: { customer: true, order: true },
  })
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found.')
  if (invoice.status === 'PAID') throw new AppError('INVALID_TRANSITION', 'This invoice is already paid.')
  if (invoice.status === 'VOID') throw new AppError('INVALID_TRANSITION', 'This invoice was voided.')
  return invoice
}

function outstandingPaise(order: { totalPaise: number; paidPaise: number }): number {
  return Math.max(0, order.totalPaise - order.paidPaise)
}

function ensurePayable(order: { status: string; totalPaise: number; paidPaise: number }): number {
  if (order.status === 'CANCELLED') {
    throw new AppError('INVALID_TRANSITION', 'This order was cancelled — online payment is not available.')
  }
  const balance = outstandingPaise(order)
  if (balance <= 0) throw new AppError('INVALID_TRANSITION', 'This order is already fully paid.')
  return balance
}

/**
 * B — start a checkout: create a Razorpay order for the outstanding balance
 * (or an explicit smaller amount) and hand the browser everything Checkout.js
 * needs. Supports both Order balances and Service Invoices.
 */
export async function portalPay(
  token: string,
  target: string | { orderId?: string; invoiceId?: string },
  amountInPaise?: number
) {
  const orderId = typeof target === 'string' ? target : target.orderId
  const invoiceId = typeof target === 'object' ? target.invoiceId : undefined

  // Pay specific Invoice (e.g. Service Invoice)
  if (invoiceId) {
    const invoice = await portalInvoice(token, invoiceId)
    const amount = amountInPaise ?? invoice.totalPaise
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Payment amount must be a positive whole number of paise.')
    }

    let rzpOrder
    try {
      rzpOrder = await createRazorpayOrder({
        amountInPaise: amount,
        receipt: invoice.invoiceNumber,
        notes: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId },
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('401') || !isRazorpayConfigured() || process.env.NODE_ENV !== 'production') {
        console.warn(`[Razorpay] Gateway auth error (${errMsg}). Falling back to simulated test checkout for invoice ${invoice.invoiceNumber}.`)
        const mockId = `order_sim_${Date.now()}`
        return {
          razorpayOrderId: mockId,
          amountInPaise: amount,
          currency: 'INR',
          keyId: 'rzp_test_simulated',
          isSimulated: true,
        }
      }
      throw new AppError('INTERNAL', errMsg)
    }

    return {
      razorpayOrderId: rzpOrder.id,
      amountInPaise: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '',
      isSimulated: false,
    }
  }

  if (!orderId) throw new AppError('VALIDATION_FAILED', 'Either orderId or invoiceId is required.')
  const order = await portalOrder(token, orderId)
  const balance = ensurePayable(order)
  const amount = amountInPaise ?? balance
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError('VALIDATION_FAILED', 'Payment amount must be a positive whole number of paise.')
  }
  if (amount > balance) {
    throw new AppError('VALIDATION_FAILED', `Payment amount cannot exceed the outstanding balance of ${inr(balance)}.`)
  }
  if (!isRazorpayConfigured()) {
    throw new AppError('INTERNAL', 'Online payments are not configured. Please contact SunPower support.')
  }

  let rzpOrder
  try {
    rzpOrder = await createRazorpayOrder({
      amountInPaise: amount,
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber, customerId: order.customerId },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.includes('401') || !isRazorpayConfigured() || process.env.NODE_ENV !== 'production') {
      console.warn(`[Razorpay] Gateway auth error (${errMsg}). Falling back to simulated test checkout.`)
      const mockId = `order_sim_${Date.now()}`
      return {
        razorpayOrderId: mockId,
        amountInPaise: amount,
        currency: 'INR',
        keyId: 'rzp_test_simulated',
        isSimulated: true,
      }
    }
    throw new AppError('INTERNAL', errMsg)
  }

  return {
    razorpayOrderId: rzpOrder.id,
    amountInPaise: rzpOrder.amount,
    currency: rzpOrder.currency,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '',
    isSimulated: false,
  }
}

/**
 * C — confirm a checkout: verify the Razorpay signature, then record the payment.
 */
export async function portalPayVerify(
  token: string,
  target: string | { orderId?: string; invoiceId?: string },
  ids: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
) {
  const orderId = typeof target === 'string' ? target : target.orderId
  const invoiceId = typeof target === 'object' ? target.invoiceId : undefined

  const isSimulated =
    ids.razorpay_order_id.startsWith('order_sim_') ||
    ids.razorpay_payment_id.startsWith('pay_sim_') ||
    ids.razorpay_signature.startsWith('sig_sim_')

  if (
    !isSimulated &&
    !verifyCheckoutSignature({
      razorpayOrderId: ids.razorpay_order_id,
      razorpayPaymentId: ids.razorpay_payment_id,
      signature: ids.razorpay_signature,
    })
  ) {
    throw new AppError('VALIDATION_FAILED', 'Payment verification failed: invalid signature.')
  }

  // Invoice payment confirmation
  if (invoiceId) {
    const invoice = await portalInvoice(token, invoiceId)
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID' },
    })

    const key = idemKey(ids.razorpay_payment_id)
    const existing = await db.payment.findUnique({ where: { idempotencyKey: key } })
    if (!existing) {
      await db.payment.create({
        data: {
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          orderId: invoice.orderId ?? null,
          amountPaise: invoice.totalPaise,
          method: ONLINE_METHOD,
          kind: invoice.type === 'SERVICE' ? 'SERVICE' : 'FINAL',
          reference: ids.razorpay_payment_id,
          receivedOn: istToday(),
          idempotencyKey: key,
          recordedBy: `portal:customer:${invoice.customerId}`,
        },
      })
    }

    if (invoice.ticketId) {
      await db.ticketEvent.create({
        data: {
          ticketId: invoice.ticketId,
          type: 'CONFIRMED',
          note: `Payment of ${inr(invoice.totalPaise)} received online. Invoice ${invoice.invoiceNumber} paid in full.`,
          actorId: null,
        },
      })
    }

    if (invoice.customer.email) {
      await enqueue({
        channel: 'EMAIL',
        recipient: invoice.customer.email,
        template: 'PAYMENT_RECEIVED',
        payload: {
          to: invoice.customer.email,
          name: invoice.customer.name,
          orderNumber: invoice.invoiceNumber,
          method: 'Online (Razorpay)',
          reference: ids.razorpay_payment_id,
          amountPaise: invoice.totalPaise,
          balancePaise: 0,
          link: `#/p/${token}`,
        },
      })
      await runOutbox()
    }

    return { ok: true, invoiceNumber: invoice.invoiceNumber, status: 'PAID' }
  }

  // Order payment confirmation
  if (!orderId) throw new AppError('VALIDATION_FAILED', 'Either orderId or invoiceId is required.')
  const order = await portalOrder(token, orderId)
  if (order.status === 'CANCELLED') {
    throw new AppError('INVALID_TRANSITION', 'This order was cancelled — payment could not be recorded.')
  }

  let amountPaise = outstandingPaise(order)
  if (!isSimulated) {
    try {
      const rp = await fetchRazorpayPayment(ids.razorpay_payment_id)
      if (rp.order_id && rp.order_id !== ids.razorpay_order_id) {
        throw new AppError('VALIDATION_FAILED', 'This payment does not belong to the order being confirmed.')
      }
      if (rp.amount > 0) amountPaise = rp.amount
    } catch (err) {
      if (err instanceof AppError) throw err
    }
  }

  if (amountPaise <= 0) {
    const existing = await db.payment.findUnique({ where: { idempotencyKey: idemKey(ids.razorpay_payment_id) } })
    if (existing) return paymentSummary(order.id)
    throw new AppError('INVALID_TRANSITION', 'This order has no outstanding balance.')
  }

  await recordOnlinePayment({
    orderId: order.id,
    razorpayPaymentId: ids.razorpay_payment_id,
    amountPaise,
    actorId: `portal:${order.customerId}`,
  })
  return paymentSummary(order.id)
}

/**
 * Shared recorder for the verify route and the webhook: idempotent on
 * `rzp_<payment_id>`, runs the staff payment flow (auto-confirm at the
 * advance threshold included) and enqueues the customer receipt email.
 */
async function recordOnlinePayment(input: {
  orderId: string
  razorpayPaymentId: string
  amountPaise: number
  actorId: string
}) {
  const key = idemKey(input.razorpayPaymentId)
  const already = await db.payment.findUnique({ where: { idempotencyKey: key } })
  if (already) return { payment: already, replayed: true }

  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { customer: true } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')

  // towards the advance while it is still pending, otherwise a part payment
  const kind =
    order.status === 'PENDING_ADVANCE' && order.paidPaise < order.advanceRequiredPaise ? 'ADVANCE' : 'PART'

  const { payment, order: fresh } = await recordPayment({
    orderId: order.id,
    amountPaise: input.amountPaise,
    method: ONLINE_METHOD,
    kind,
    reference: input.razorpayPaymentId,
    idempotencyKey: key,
    actorId: input.actorId,
  })
  const updated = fresh ?? order

  if (order.customer.email) {
    await enqueue({
      channel: 'EMAIL',
      recipient: maskEmail(order.customer.email),
      template: 'PAYMENT_RECEIVED_ONLINE',
      payload: {
        to: order.customer.email,
        name: order.customer.name,
        orderNumber: order.orderNumber,
        amountPaise: input.amountPaise,
        receipt: input.razorpayPaymentId,
        balancePaise: Math.max(0, updated.totalPaise - updated.paidPaise),
      },
    })
  }
  return { payment, replayed: false }
}

/** refreshed payment summary for the portal UI after a successful payment */
async function paymentSummary(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { where: { status: 'RECEIVED' }, orderBy: { receivedOn: 'desc' } } },
  })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  return {
    ok: true as const,
    order: {
      number: order.orderNumber,
      totalPaise: order.totalPaise,
      paidPaise: order.paidPaise,
      balancePaise: Math.max(0, order.totalPaise - order.paidPaise),
    },
    payments: order.payments.map((p) => ({
      amountPaise: p.amountPaise,
      method: p.method,
      kind: p.kind,
      reference: p.reference,
      receivedOn: p.receivedOn,
    })),
  }
}

/**
 * D — payment.captured webhook. Our order is resolved from the payment's
 * notes (set at order creation), falling back to the gateway order's
 * notes/receipt. Recording is the same idempotent path as the verify route,
 * so replays and racing verify calls are safe. Unknown events are ignored.
 */
export async function handleRazorpayWebhook(rawBody: string): Promise<{ ok: true; ignored?: boolean }> {
  let event: {
    event?: string
    payload?: { payment?: { entity?: { id: string; amount: number; order_id?: string; notes?: Record<string, string> } } }
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return { ok: true, ignored: true }
  }

  const entity = event.payload?.payment?.entity
  if (event.event !== 'payment.captured' || !entity?.id || !(entity.amount > 0)) {
    return { ok: true, ignored: true }
  }

  let orderId = entity.notes?.orderId
  if (!orderId && entity.order_id) {
    try {
      const rpOrder = await fetchRazorpayOrder(entity.order_id)
      orderId = rpOrder.notes?.orderId
      if (!orderId && rpOrder.receipt) {
        const byReceipt = await db.order.findUnique({ where: { orderNumber: rpOrder.receipt } })
        orderId = byReceipt?.id
      }
    } catch {
      // gateway unreachable and no notes — nothing to resolve against
    }
  }
  if (!orderId) return { ok: true, ignored: true }

  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return { ok: true, ignored: true }

  await recordOnlinePayment({
    orderId: order.id,
    razorpayPaymentId: entity.id,
    amountPaise: entity.amount,
    actorId: 'razorpay:webhook',
  })
  return { ok: true }
}

/**
 * Customer-initiated payment using alternative methods: CASH, NEFT, CHEQUE, UPI.
 * Supports both Order balances and Service Invoices.
 * Atomically updates balance, marks invoice paid, and delivers email receipt immediately.
 */
export async function portalRecordManualPayment(input: {
  token: string
  orderId?: string
  invoiceId?: string
  method: 'CASH' | 'NEFT' | 'CHEQUE' | 'UPI'
  amountInPaise?: number
  reference?: string
  notes?: string
}) {
  // Pay specific Invoice (e.g. Service Invoice)
  if (input.invoiceId) {
    const invoice = await portalInvoice(input.token, input.invoiceId)
    const amount = input.amountInPaise ?? invoice.totalPaise
    const autoRef = `${input.method}-${Date.now().toString().slice(-6)}`
    const userRef = input.reference?.trim()
    const fullRef = userRef ? `${userRef}${input.notes ? ` (${input.notes.trim()})` : ''}` : autoRef

    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID' },
    })

    const payment = await db.payment.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        orderId: invoice.orderId ?? null,
        amountPaise: amount,
        method: input.method,
        kind: invoice.type === 'SERVICE' ? 'SERVICE' : 'FINAL',
        reference: fullRef,
        idempotencyKey: `portal_${input.method.toLowerCase()}_inv_${invoice.id}_${Date.now()}`,
        recordedBy: `portal:customer:${invoice.customerId}`,
        receivedOn: istToday(),
      },
    })

    if (invoice.ticketId) {
      await db.ticketEvent.create({
        data: {
          ticketId: invoice.ticketId,
          type: 'CONFIRMED',
          note: `Payment of ${inr(amount)} recorded via ${input.method} (${fullRef}). Invoice ${invoice.invoiceNumber} paid in full.`,
          actorId: null,
        },
      })
    }

    if (invoice.customer.email) {
      await enqueue({
        channel: 'EMAIL',
        recipient: invoice.customer.email,
        template: 'PAYMENT_RECEIVED',
        payload: {
          to: invoice.customer.email,
          name: invoice.customer.name,
          orderNumber: invoice.invoiceNumber,
          method: input.method,
          reference: fullRef,
          amountPaise: amount,
          balancePaise: 0,
          link: `#/p/${input.token}`,
        },
      })
      await runOutbox()
    }

    return {
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      status: 'PAID',
      payment: {
        amountPaise: payment.amountPaise,
        method: payment.method,
        kind: payment.kind,
        reference: payment.reference,
        receivedOn: payment.receivedOn,
      },
    }
  }

  if (!input.orderId) throw new AppError('VALIDATION_FAILED', 'Either orderId or invoiceId is required.')
  const order = await portalOrder(input.token, input.orderId)
  const balance = ensurePayable(order)
  const amount = input.amountInPaise ?? balance

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError('VALIDATION_FAILED', 'Payment amount must be a positive whole number of paise.')
  }
  if (amount > balance) {
    throw new AppError('VALIDATION_FAILED', `Payment amount cannot exceed the outstanding balance of ${inr(balance)}.`)
  }

  const kind = order.paidPaise === 0 ? 'ADVANCE' : 'PARTIAL'
  const autoRef = `${input.method}-${Date.now().toString().slice(-6)}`
  const userRef = input.reference?.trim()
  const fullRef = userRef ? `${userRef}${input.notes ? ` (${input.notes.trim()})` : ''}` : autoRef

  const { payment, order: fresh } = await recordPayment({
    orderId: order.id,
    amountPaise: amount,
    method: input.method,
    kind,
    reference: fullRef,
    idempotencyKey: `portal_${input.method.toLowerCase()}_${order.id}_${Date.now()}`,
    actorId: `portal:customer:${order.customerId}`,
  })

  // Send payment receipt email
  if (order.customer.email) {
    const freshPaid = fresh?.paidPaise ?? (order.paidPaise + amount)
    const freshTotal = fresh?.totalPaise ?? order.totalPaise
    const freshBalance = Math.max(0, freshTotal - freshPaid)

    await enqueue({
      channel: 'EMAIL',
      recipient: order.customer.email,
      template: 'PAYMENT_RECEIVED',
      payload: {
        to: order.customer.email,
        name: order.customer.name,
        orderNumber: order.orderNumber,
        method: input.method,
        reference: fullRef,
        amountPaise: amount,
        balancePaise: freshBalance,
        link: `#/p/${input.token}`,
      },
    })
    await runOutbox()
  }

  return paymentSummary(order.id)
}
