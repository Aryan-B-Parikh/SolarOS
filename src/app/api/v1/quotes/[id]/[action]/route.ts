import { NextRequest } from 'next/server'
import { handler, handlerWithSchema } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability } from '@/lib/auth'
import { z } from 'zod'
import { sendQuote, reviseQuote, approveDiscount, acceptQuoteOffline, updateQuoteLines } from '@/services/quotes'

const acceptSchema = z.object({
  acceptedName: z.string().min(2).max(120),
  note: z.string().max(500).nullable().optional(),
})
const linesSchema = z.object({
  lines: z.array(z.object({
    productId: z.string(),
    description: z.string().min(1).max(200),
    qty: z.number().positive().max(10000),
    unitPriceRupees: z.number().min(0),
    taxRateBp: z.number().int().min(0).max(10000).optional(),
  })).min(1).max(50),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'send') {
    return handler(req, async () => {
      const user = await requireCapability('leads.write')
      const result = await sendQuote(id, user.id)
      return { ok: true, token: result.token }
    })
  }
  if (action === 'approve-discount') {
    return handler(req, async () => {
      const user = await requireCapability('discount.overLimit')
      return { ...(await approveDiscount(id, user.id)), ok: true }
    })
  }
  if (action === 'revise') {
    return handlerWithSchema(req, z.object({}), async () => {
      const user = await requireCapability('leads.write')
      return { quote: await reviseQuote(id, user.id) }
    })
  }
  if (action === 'accept') {
    // T45R25 "record offline acceptance": sales records an acceptance taken by
    // phone or in person; the audit trail names the staff member.
    return handlerWithSchema(req, acceptSchema, async ({ body }) => {
      const user = await requireCapability('leads.write')
      const order = await acceptQuoteOffline(id, body.acceptedName, body.note ?? null, user.id)
      return { ok: true, orderNumber: order.orderNumber }
    })
  }
  if (action === 'lines') {
    // manual quote-line edit on a draft: totals, GST and margin recompute
    return handlerWithSchema(req, linesSchema, async ({ body }) => {
      const user = await requireCapability('leads.write')
      const quote = await updateQuoteLines(
        id,
        body.lines.map((l) => ({
          productId: l.productId, description: l.description, qty: l.qty,
          unitPricePaise: Math.round(l.unitPriceRupees * 100), taxRateBp: l.taxRateBp,
        })),
        user.id
      )
      return { quote }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
