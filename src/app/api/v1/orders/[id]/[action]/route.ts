import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability, requireRole } from '@/lib/auth'
import { recordPayment, confirmOrder, cancelOrder, updateSubsidy, refreshCrewSuggestions, reversePayment } from '@/services/orders'

const paymentSchema = z.object({
  amountRupees: z.number().positive(), method: z.enum(['UPI', 'NEFT', 'CASH', 'CHEQUE', 'LOAN']),
  kind: z.enum(['ADVANCE', 'PART', 'FINAL']).optional(), reference: z.string().optional(),
  idempotencyKey: z.string().optional(),
})
const cancelSchema = z.object({ reason: z.string().min(3) })
const subsidySchema = z.object({
  status: z.enum(['NOT_STARTED', 'PREPARING', 'SUBMITTED', 'APPROVED', 'DISBURSED', 'REJECTED']).optional(),
  applicationRef: z.string().optional(), notes: z.string().optional(), receivedRupees: z.number().optional(),
})
const reverseSchema = z.object({ paymentId: z.string(), reason: z.string().min(3) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'payments') {
    return handlerWithSchema(req, paymentSchema, async ({ body }) => {
      const user = await requireCapability('payments.write')
      return await recordPayment({
        orderId: id, amountPaise: Math.round(body.amountRupees * 100), method: body.method,
        kind: body.kind, reference: body.reference, idempotencyKey: body.idempotencyKey, actorId: user.id,
      })
    })
  }
  if (action === 'confirm') {
    return handler(req, async () => {
      // FR-4.3/T38: the director override is a DIRECTOR-only action
      const user = await requireRole('DIRECTOR')
      return { order: await confirmOrder(id, user.id) }
    })
  }
  if (action === 'cancel') {
    return handlerWithSchema(req, cancelSchema, async ({ body }) => {
      // T38R7: cancellation is a director decision (reservations released, refund recorded)
      const user = await requireRole('DIRECTOR')
      return await cancelOrder(id, body.reason, user.id)
    })
  }
  if (action === 'reverse-payment') {
    return handlerWithSchema(req, reverseSchema, async ({ body }) => {
      const user = await requireCapability('payments.write')
      return await reversePayment(body.paymentId, body.reason, user.id)
    })
  }
  if (action === 'subsidy') {
    return handlerWithSchema(req, subsidySchema, async ({ body }) => {
      const user = await requireCapability('payments.write')
      return { subsidy: await updateSubsidy(id, { status: body.status, applicationRef: body.applicationRef, notes: body.notes, receivedPaise: body.receivedRupees ? Math.round(body.receivedRupees * 100) : undefined }, user.id) }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
