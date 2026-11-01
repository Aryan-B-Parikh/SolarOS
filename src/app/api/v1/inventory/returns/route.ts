import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { recordReturn } from '@/services/inventory'

// FR-5.7: record goods returned to the warehouse — an audited RETURN movement
// that raises on-hand stock (creates the StockLevel row if it is missing).
const schema = z.object({
  productId: z.string(),
  unitId: z.string().nullable().optional(),
  qty: z.number().positive(),
  reason: z.string().min(3),
  orderId: z.string().nullable().optional(),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('stock.write')
    return await recordReturn({
      productId: body.productId,
      unitId: body.unitId ?? null,
      qty: body.qty,
      reason: body.reason,
      orderId: body.orderId ?? null,
      actorId: user.id,
    })
  })
}
