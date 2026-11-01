import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { adjustStock } from '@/services/inventory'

const schema = z.object({ productId: z.string(), deltaQty: z.number(), reason: z.string().min(3) })

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('stock.write')
    return await adjustStock({ ...body, actorId: user.id })
  })
}
