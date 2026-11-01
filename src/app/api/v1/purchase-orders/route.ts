import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listPurchaseOrders, createPurchaseOrder } from '@/services/inventory'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('purchasing.read')
    return { purchaseOrders: await listPurchaseOrders() }
  })
}

const schema = z.object({
  supplierId: z.string(),
  expectedOn: z.string().optional(),
  lines: z.array(z.object({ productId: z.string(), qty: z.number().positive(), unitCostRupees: z.number().positive() })).min(1),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('purchasing.write')
    return { purchaseOrder: await createPurchaseOrder({
      supplierId: body.supplierId, expectedOn: body.expectedOn,
      lines: body.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCostPaise: Math.round(l.unitCostRupees * 100) })),
      actorId: user.id,
    }) }
  })
}
