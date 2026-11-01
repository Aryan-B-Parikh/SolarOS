import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { leadDetail, updateQualification } from '@/services/leads'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('leads.read')
    return { lead: await leadDetail(id) }
  })
}

const schema = z.object({
  roofAreaSqm: z.number().nullable().optional(),
  monthlyBillRupees: z.number().nullable().optional(),
  monthlyUnits: z.number().nullable().optional(),
  gridOk: z.boolean().nullable().optional(),
  sanctionedLoadKw: z.number().nullable().optional(),
  phase: z.enum(['SINGLE', 'THREE']).nullable().optional(),
  tariffRupees: z.number().nullable().optional(),
  requestedCapacityKw: z.number().nullable().optional(),
  systemTypePref: z.enum(['ON_GRID', 'OFF_GRID']).nullable().optional(),
  wantsSubsidy: z.boolean().nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('leads.write')
    const lead = await updateQualification(id, {
      roofAreaSqm: body.roofAreaSqm ?? undefined,
      monthlyBillPaise: body.monthlyBillRupees != null ? Math.round(body.monthlyBillRupees * 100) : undefined,
      monthlyUnits: body.monthlyUnits ?? undefined,
      gridOk: body.gridOk ?? undefined,
      sanctionedLoadKw: body.sanctionedLoadKw ?? undefined,
      phase: body.phase ?? undefined,
      tariffPaise: body.tariffRupees != null ? Math.round(body.tariffRupees * 100) : undefined,
      requestedCapacityKw: body.requestedCapacityKw ?? undefined,
      systemTypePref: body.systemTypePref ?? undefined,
      wantsSubsidy: body.wantsSubsidy ?? undefined,
    }, user.id)
    return { lead }
  })
}
