import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireUser } from '@/lib/auth'
import { startJob, updateJob, signoffJob, holdJob, requireJobAccess } from '@/services/installations'
import { scheduleInstallation, refreshCrewSuggestions } from '@/services/orders'

const scheduleSchema = z.object({ scheduledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.enum(['MORNING', 'AFTERNOON']), crewLeadId: z.string(), crewTechnicianIds: z.array(z.string()).optional() })
const checklistShape = z.object({
  standsMounted: z.boolean(), panelsLaid: z.boolean(), wiringBoxes: z.boolean(),
  earthingDone: z.boolean(), powerTest: z.boolean(),
})
const updateSchema = z.object({
  checklist: checklistShape.optional(),
  installedCapacityKw: z.number().optional(), testReadingW: z.number().optional(),
})
const signoffSchema = z.object({
  signedName: z.string().min(2), signatureAttachmentId: z.string().nullable().optional(),
  installedCapacityKw: z.number().optional(), testReadingW: z.number().optional(),
  checklist: checklistShape.optional(),
  finishLat: z.number().optional(), finishLng: z.number().optional(),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().optional(),
})
const holdSchema = z.object({ reason: z.string().min(3), newDate: z.string().nullable().optional() })
const startSchema = z.object({ lat: z.number().optional(), lng: z.number().optional() })

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'crew-suggestions') {
    return handler(req, async () => {
      await requireUser()
      return { suggestions: await refreshCrewSuggestions(id) }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'schedule') {
    return handlerWithSchema(req, scheduleSchema, async ({ body }) => {
      const user = await requireUser()
      if (user.role !== 'DIRECTOR') throw new AppError('FORBIDDEN', 'Only the director or scheduler confirms the crew and date.')
      return { installation: await scheduleInstallation(id, body, user.id) }
    })
  }
  if (action === 'start') {
    return handlerWithSchema(req, startSchema, async ({ body }) => {
      const user = await requireUser()
      await requireJobAccess(id, user)
      return await startJob(id, user.id, body.lat != null ? { lat: body.lat, lng: body.lng! } : undefined)
    })
  }
  if (action === 'update') {
    return handlerWithSchema(req, updateSchema, async ({ body }) => {
      const user = await requireUser()
      await requireJobAccess(id, user)
      return { installation: await updateJob(id, body, user.id) }
    })
  }
  if (action === 'signoff') {
    return handlerWithSchema(req, signoffSchema, async ({ body }) => {
      const user = await requireUser()
      await requireJobAccess(id, user)
      return await signoffJob(id, { ...body, actorId: user.id })
    })
  }
  if (action === 'hold') {
    return handlerWithSchema(req, holdSchema, async ({ body }) => {
      const user = await requireUser()
      await requireJobAccess(id, user)
      return await holdJob(id, body.reason, body.newDate ?? null, user.id)
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
