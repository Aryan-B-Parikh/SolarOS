// Product update (FR-9.2): catalogue fields, pricing, reorder level and the
// warranty terms (warrantyMonths + warrantyStartBasis) that drive service
// eligibility. Every change is audited with before/after values.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit } from '@/lib/outbox'

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  brand: z.string().max(80).nullable().optional(),
  category: z.enum(['PANEL', 'INVERTER', 'BATTERY', 'CHARGE_CONTROLLER', 'MOUNTING', 'CABLE', 'ACDB', 'DCDB', 'EARTHING', 'LIGHTNING_ARRESTER', 'CONNECTOR', 'SERVICE']).optional(),
  isSerialized: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(360).optional(),
  warrantyStartBasis: z.enum(['DELIVERY', 'INSTALLATION_SIGNOFF']).optional(),
  stdCostPaise: z.number().int().min(0).optional(),
  salePricePaise: z.number().int().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  monitoringUrl: z.string().max(300).nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handlerWithSchema(req, updateSchema, async ({ body }) => {
    const actor = await requireCapability('products.write')
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) throw new AppError('NOT_FOUND', 'Product not found.')
    if (Object.keys(body).length === 0) throw new AppError('VALIDATION_FAILED', 'Nothing to update.')

    const product = await db.product.update({ where: { id }, data: body })

    const fields = Object.keys(body)
    await audit({
      actorType: 'USER', actorId: actor.id, entityType: 'product', entityId: id,
      action: 'PRODUCT_UPDATE',
      before: Object.fromEntries(fields.map((k) => [k, (existing as Record<string, unknown>)[k]])),
      after: Object.fromEntries(fields.map((k) => [k, (product as Record<string, unknown>)[k]])),
    })

    return { product }
  })
}
