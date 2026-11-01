import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireUser()
    const survey = await db.siteSurvey.findUnique({
      where: { id },
      include: { lead: { include: { customer: true, assessments: true } } },
    })
    if (!survey) throw new AppError('NOT_FOUND', 'Survey not found.')
    const photos = await db.attachment.findMany({ where: { ownerType: 'SURVEY', ownerId: id } })
    return { survey, photos: photos.map((p) => ({ id: p.id, kind: p.kind, url: `/api/v1/files/${p.id}` })) }
  })
}
