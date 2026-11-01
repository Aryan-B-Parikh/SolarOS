import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listLeads, createLeadFromEnquiry } from '@/services/leads'

export async function GET(req: NextRequest) {
  const sp = searchParams(req)
  return handler(req, async () => {
    await requireCapability('leads.read')
    return { leads: await listLeads({ status: sp.get('status') ?? undefined, ownerId: sp.get('ownerId') ?? undefined, q: sp.get('q') ?? undefined }) }
  })
}

const schema = z.object({
  name: z.string().min(2), phone: z.string().min(10),
  addressLine: z.string().min(5), city: z.string().min(2), pincode: z.string().regex(/^\d{6}$/),
  source: z.enum(['WHATSAPP', 'PHONE', 'WALK_IN', 'REFERRAL']),
  requestedCapacityKw: z.number().nullable().optional(),
  systemTypePref: z.enum(['ON_GRID', 'OFF_GRID']).nullable().optional(),
  wantsSubsidy: z.boolean().optional(),
  monthlyBillRupees: z.number().nullable().optional(),
  consent: z.literal(true),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('leads.write')
    const result = await createLeadFromEnquiry({
      ...body,
      monthlyBillPaise: body.monthlyBillRupees ? Math.round(body.monthlyBillRupees * 100) : null,
      actorId: user.id,
    }, { requestId: 'staff' })
    return { reference: result.lead.leadNumber, leadId: result.lead.id, duplicateFlags: result.duplicateFlags }
  })
}
