import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit } from '@/lib/outbox'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireUser()
    return { products: await db.product.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }) }
  })
}

// Catalogue admin (FR-9.2): create products incl. their warranty terms
// (warrantyMonths + warrantyStartBasis). All changes are audited.
const CATEGORIES = ['PANEL', 'INVERTER', 'BATTERY', 'CHARGE_CONTROLLER', 'MOUNTING', 'CABLE', 'ACDB', 'DCDB', 'EARTHING', 'LIGHTNING_ARRESTER', 'CONNECTOR', 'SERVICE'] as const

const createSchema = z.object({
  sku: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  category: z.enum(CATEGORIES),
  brand: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  uom: z.enum(['NOS', 'MTR', 'SET', 'SVC']).optional(),
  isSerialized: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(360).optional(),
  warrantyStartBasis: z.enum(['DELIVERY', 'INSTALLATION_SIGNOFF']).optional(),
  ratedPowerW: z.number().int().min(0).max(2000).nullable().optional(),
  hsnCode: z.string().max(20).nullable().optional(),
  taxRateBp: z.number().int().min(0).max(5000).optional(),
  stdCostPaise: z.number().int().min(0).optional(),
  salePricePaise: z.number().int().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  monitoringUrl: z.string().max(300).nullable().optional(),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, createSchema, async ({ body }) => {
    const actor = await requireCapability('products.write')
    const sku = body.sku.trim().toUpperCase()
    if (await db.product.findUnique({ where: { sku } })) {
      throw new AppError('CONFLICT', 'A product with this SKU already exists.')
    }
    const product = await db.product.create({
      data: {
        sku,
        name: body.name.trim(),
        category: body.category,
        brand: body.brand ?? null,
        model: body.model ?? null,
        uom: body.uom ?? 'NOS',
        isSerialized: body.isSerialized ?? false,
        warrantyMonths: body.warrantyMonths ?? 24,
        warrantyStartBasis: body.warrantyStartBasis ?? 'DELIVERY',
        ratedPowerW: body.ratedPowerW ?? null,
        hsnCode: body.hsnCode ?? null,
        taxRateBp: body.taxRateBp ?? 0,
        stdCostPaise: body.stdCostPaise ?? 0,
        salePricePaise: body.salePricePaise ?? 0,
        reorderLevel: body.reorderLevel ?? 0,
        monitoringUrl: body.monitoringUrl ?? null,
      },
    })
    await audit({
      actorType: 'USER', actorId: actor.id, entityType: 'product', entityId: product.id,
      action: 'PRODUCT_CREATE',
      after: { sku: product.sku, name: product.name, category: product.category, salePricePaise: product.salePricePaise },
    })
    return { product }
  })
}
