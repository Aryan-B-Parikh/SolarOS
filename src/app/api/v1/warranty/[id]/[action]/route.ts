import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability } from '@/lib/auth'
import { requestWarrantyVoid, approveWarrantyVoid, rejectWarrantyVoid } from '@/services/warranty-admin'

// FR-7.7: SUPPORT requests a warranty exclusion (photo evidence + reason);
// DIRECTOR approves or rejects it.
const requestSchema = z.object({
  reason: z.string().min(10).max(1000),
  attachmentIds: z.array(z.string()).min(1).max(6),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'void-request') {
    return handlerWithSchema(req, requestSchema, async ({ body }) => {
      const user = await requireCapability('warranty.exclusion.request')
      return { warranty: await requestWarrantyVoid(id, { reason: body.reason, attachmentIds: body.attachmentIds }, user.id) }
    })
  }
  if (action === 'void-approve') {
    return handler(req, async () => {
      const user = await requireCapability('warranty.exclusion.approve')
      return { ...(await approveWarrantyVoid(id, user.id)) }
    })
  }
  if (action === 'void-reject') {
    return handlerWithSchema(req, z.object({ note: z.string().max(500).optional() }), async ({ body }) => {
      const user = await requireCapability('warranty.exclusion.approve')
      return { ...(await rejectWarrantyVoid(id, user.id, body.note)) }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown warranty action.') })
}
