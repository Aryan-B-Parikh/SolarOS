import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability } from '@/lib/auth'
import { transitionLead, resolveDuplicate } from '@/services/leads'
import { scheduleSurvey, runAssessment, runPhotoAnalysis } from '@/services/surveys'

const transitionSchema = z.object({ to: z.string(), reason: z.string().optional(), note: z.string().optional() })
const surveySchema = z.object({ surveyorId: z.string(), scheduledAt: z.string() })
const duplicateSchema = z.object({ flagId: z.string(), action: z.enum(['LINKED', 'DISMISSED']) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'transitions') {
    return handlerWithSchema(req, transitionSchema, async ({ body }) => {
      const user = await requireCapability('leads.write')
      return { lead: await transitionLead(id, body.to as never, user.id, { reason: body.reason, note: body.note }) }
    })
  }
  if (action === 'surveys') {
    return handlerWithSchema(req, surveySchema, async ({ body }) => {
      const user = await requireCapability('leads.write')
      return { survey: await scheduleSurvey(id, body, user.id) }
    })
  }
  if (action === 'assessments') {
    return handler(req, async () => {
      const user = await requireCapability('leads.write')
      return await runAssessment(id, user.id)
    })
  }
  if (action === 'resolve-duplicate') {
    return handlerWithSchema(req, duplicateSchema, async ({ body }) => {
      const user = await requireCapability('leads.write')
      await resolveDuplicate(id, body.flagId, body.action, user.id)
      return { ok: true }
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
