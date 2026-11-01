import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability } from '@/lib/auth'
import { scanUnit, unscanUnit, loadQuantity, depart, deliver } from '@/services/dispatch'

const scanSchema = z.object({ code: z.string().min(3), method: z.enum(['QR', 'BARCODE', 'MANUAL']).default('QR'), idempotencyKey: z.string().optional() })
const unscanSchema = z.object({ unitId: z.string() })
const loadSchema = z.object({ lineId: z.string(), qty: z.number().positive() })
const deliverSchema = z.object({ lat: z.number().optional(), lng: z.number().optional() })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'scan') {
    return handlerWithSchema(req, scanSchema, async ({ body }) => {
      const user = await requireCapability('stock.write')
      return await scanUnit(id, body.code, body.method, user.id, body.idempotencyKey)
    })
  }
  if (action === 'unscan') {
    return handlerWithSchema(req, unscanSchema, async ({ body }) => {
      const user = await requireCapability('stock.write')
      return await unscanUnit(id, body.unitId, user.id)
    })
  }
  if (action === 'load') {
    return handlerWithSchema(req, loadSchema, async ({ body }) => {
      const user = await requireCapability('stock.write')
      return await loadQuantity(id, body.lineId, body.qty, user.id)
    })
  }
  if (action === 'depart') {
    return handler(req, async () => {
      const user = await requireCapability('stock.write')
      return await depart(id, user.id)
    })
  }
  if (action === 'deliver') {
    return handlerWithSchema(req, deliverSchema, async ({ body }) => {
      const user = await requireUserAllowCrew()
      return await deliver(id, user.id, body.lat != null ? { lat: body.lat, lng: body.lng! } : undefined)
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}

async function requireUserAllowCrew() {
  return requireCapability('stock.write')
}
