import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability, requireUser } from '@/lib/auth'
import { assignTicket, startTicket, resolveTicket, confirmTicket, reopenTicket } from '@/services/tickets'

const assignSchema = z.object({ technicianUserId: z.string() })
const resolveSchema = z.object({
  resolutionNotes: z.string().min(3),
  labourHours: z.number().min(0).max(24).optional(),
  parts: z.array(z.object({
    productId: z.string(), qty: z.number().positive(),
    removedUnitId: z.string().nullable().optional(), installedUnitId: z.string().nullable().optional(),
  })).optional(),
})
const reopenSchema = z.object({ note: z.string().optional() })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'assign') {
    return handlerWithSchema(req, assignSchema, async ({ body }) => {
      const user = await requireCapability('tickets.write')
      return { ticket: await assignTicket(id, body.technicianUserId, user.id) }
    })
  }
  if (action === 'start') {
    return handler(req, async () => {
      const user = await requireUser()
      return { ticket: await startTicket(id, user.id) }
    })
  }
  if (action === 'resolve') {
    return handlerWithSchema(req, resolveSchema, async ({ body }) => {
      const user = await requireUser()
      return { ticket: await resolveTicket(id, { ...body, actorId: user.id }) }
    })
  }
  if (action === 'confirm') {
    return handler(req, async () => {
      const user = await requireCapability('tickets.write')
      return { ticket: await confirmTicket(id, 'PHONE', user.id) }
    })
  }
  if (action === 'reopen') {
    return handlerWithSchema(req, reopenSchema, async ({ body }) => {
      const user = await requireCapability('tickets.write')
      return { ticket: await reopenTicket(id, body.note ?? '', user.id) }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
