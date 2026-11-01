import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { portalAcceptQuote, portalRejectQuote } from '@/services/portal'

const acceptSchema = z.object({ acceptedName: z.string().min(2).max(120), idempotencyKey: z.string().optional() })
const rejectSchema = z.object({ reason: z.string().min(3).max(500) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; action: string }> }) {
  const { token, action } = await ctx.params
  if (action === 'accept') {
    return handlerWithSchema(req, acceptSchema, async ({ body }) => {
      const order = await portalAcceptQuote(token, body.acceptedName, body.idempotencyKey)
      return { ok: true, orderNumber: order.orderNumber }
    })
  }
  if (action === 'reject') {
    return handlerWithSchema(req, rejectSchema, async ({ body }) => {
      await portalRejectQuote(token, body.reason)
      return { ok: true }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
