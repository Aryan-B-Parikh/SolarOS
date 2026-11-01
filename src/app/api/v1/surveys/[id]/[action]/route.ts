import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema, handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireCapability, requireUser } from '@/lib/auth'
import { saveSurvey, completeSurvey, reviewSurvey, runPhotoAnalysis } from '@/services/surveys'

const saveSchema = z.object({
  roofType: z.enum(['RCC', 'METAL', 'TILE']).optional(),
  azimuthDeg: z.number().min(0).max(359).optional(),
  tiltDeg: z.number().min(0).max(90).optional(),
  usableAreaSqm: z.number().min(1).max(10000).optional(),
  shading: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
  cableDistanceM: z.number().min(0).max(500).optional(),
  structureHeightM: z.number().min(0).max(30).optional(),
})
const reviewSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().optional() })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params
  if (action === 'save') {
    return handlerWithSchema(req, saveSchema, async ({ body }) => {
      const user = await requireUser()
      return { survey: await saveSurvey(id, body, user.id) }
    })
  }
  if (action === 'complete') {
    return handler(req, async () => {
      const user = await requireUser()
      return { survey: await completeSurvey(id, user.id) }
    })
  }
  if (action === 'review') {
    return handlerWithSchema(req, reviewSchema, async ({ body }) => {
      const user = await requireCapability('survey.approve')
      await reviewSurvey(id, body.decision, user.id, body.reason)
      return { ok: true }
    })
  }
  if (action === 'photo-analysis') {
    return handler(req, async () => {
      const user = await requireCapability('leads.read')
      return await runPhotoAnalysis(id, user.id)
    })
  }
  return handler(req, async () => { throw new AppError('NOT_FOUND', 'Unknown action.') })
}
