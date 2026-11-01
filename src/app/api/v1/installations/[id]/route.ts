import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { installationDetail } from '@/services/installations'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireUser()
    const installation = await installationDetail(id)
    const photos = await db.attachment.findMany({ where: { ownerType: 'INSTALLATION', ownerId: id }, orderBy: { createdAt: 'asc' } })
    const surveys = await db.siteSurvey.findMany({
      where: { lead: { quotes: { some: { order: { id: installation.orderId } } } } },
    })
    const beforePhotos = surveys.length > 0
      ? await db.attachment.findMany({ where: { ownerType: 'SURVEY', ownerId: { in: surveys.map((s) => s.id) } } })
      : []
    return {
      installation,
      photos: photos.map((p) => ({ id: p.id, kind: p.kind, url: `/api/v1/files/${p.id}`, takenAt: p.takenAt })),
      beforePhotos: beforePhotos.map((p) => ({ id: p.id, kind: 'BEFORE', url: `/api/v1/files/${p.id}`, takenAt: p.takenAt })),
    }
  })
}
