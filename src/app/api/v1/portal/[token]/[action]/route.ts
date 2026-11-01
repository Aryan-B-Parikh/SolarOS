import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { portalVerify, portalRaiseTicket, portalTicketAction, portalFaultCodes, portalInvoice, portalWarrantyDoc } from '@/services/portal'

const verifySchema = z.object({
  last4: z.string().optional(),
  email: z.string().optional(),
})
const ticketSchema = z.object({
  category: z.enum(['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER']),
  description: z.string().min(5).max(1000),
  faultCode: z.string().max(20).optional(),
  unitId: z.string().optional(),
  photoIds: z.array(z.string()).max(4).optional(),
})
const ticketActionSchema = z.object({ ticketNumber: z.string(), action: z.enum(['CONFIRM', 'REOPEN']), note: z.string().max(500).optional() })
const invoiceSchema = z.object({ invoiceNumber: z.string().min(3), last4: z.string().regex(/^\d{4}$/) })
const warrantySchema = z.object({ warrantyId: z.string().min(6) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; action: string }> }) {
  const { token, action } = await ctx.params
  if (action === 'verify') {
    return handlerWithSchema(req, verifySchema, async ({ body }) => portalVerify(token, body))
  }
  if (action === 'tickets') {
    return handlerWithSchema(req, ticketSchema, async ({ body }) => {
      const t = await portalRaiseTicket(token, body)
      return { ticketNumber: t!.ticketNumber, verdict: t!.warrantyVerdict, billingMode: t!.billingMode, priority: t!.priority }
    })
  }
  if (action === 'ticket-action') {
    return handlerWithSchema(req, ticketActionSchema, async ({ body }) => {
      const t = await portalTicketAction(token, body.ticketNumber, body.action, body.note)
      return { status: t!.status }
    })
  }
  if (action === 'fault-codes') {
    return handler(req, async () => portalFaultCodes(token))
  }
  if (action === 'invoice') {
    return handlerWithSchema(req, invoiceSchema, async ({ body }) => portalInvoice(token, body.invoiceNumber, body.last4))
  }
  if (action === 'warranty') {
    return handlerWithSchema(req, warrantySchema, async ({ body }) => portalWarrantyDoc(token, body.warrantyId))
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown portal action.') })
}
