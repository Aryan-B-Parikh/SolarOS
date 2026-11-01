import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { cancelPurchaseOrder } from '@/services/inventory'

// FR-5.8: cancel an OPEN or PARTIAL purchase order with a required reason.
const schema = z.object({ reason: z.string().min(3) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('purchasing.write')
    return await cancelPurchaseOrder(id, body.reason, user.id)
  })
}
