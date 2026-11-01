import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability, requireUser } from '@/lib/auth'
import { getSettings, saveSettings } from '@/lib/settings'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireUser()
    return { settings: await getSettings() }
  })
}

const schema = z.object({
  companyName: z.string().optional(), gstin: z.string().optional(), address: z.string().optional(),
  phone: z.string().optional(), email: z.string().optional(), bankDetails: z.string().optional(),
  advancePct: z.number().min(5).max(100).optional(),
  targetMarginBp: z.number().min(0).max(10000).optional(),
  salesDiscountLimitBp: z.number().min(0).max(10000).optional(),
  yieldKwhPerKwpPerDay: z.number().min(1).max(8).optional(),
  roofAreaPerKwSqm: z.number().min(4).max(20).optional(),
  quoteValidityDays: z.number().min(1).max(90).optional(),
  aiEnabled: z.boolean().optional(),
  photoAnalysisEnabled: z.boolean().optional(),
  // energy economics + service SLA + working calendar (FR-9.2)
  defaultTariffPaise: z.number().int().min(0).max(100000).optional(),
  slaHoursByPriority: z.object({
    LOW: z.number().int().min(1).max(2000),
    NORMAL: z.number().int().min(1).max(2000),
    HIGH: z.number().int().min(1).max(2000),
    URGENT: z.number().int().min(1).max(2000),
  }).optional(),
  businessStartHour: z.number().int().min(0).max(23).optional(),
  businessEndHour: z.number().int().min(0).max(23).optional(),
  businessDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
}).superRefine((val, ctx) => {
  if (val.businessStartHour !== undefined && val.businessEndHour !== undefined && val.businessStartHour >= val.businessEndHour) {
    ctx.addIssue({ code: 'custom', path: ['businessEndHour'], message: 'End hour must be after start hour.' })
  }
})

export async function PATCH(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('settings.write')
    return { settings: await saveSettings(body, user.id) }
  })
}
