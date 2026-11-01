import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'
import { sha256, randomToken } from '@/lib/auth'
// FR-8.6: expiring read-only share link for the analytics dashboard.
const schema = z.object({
  period: z.enum(['today', 'week', 'month', 'all', 'custom']).default('month'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(90).default(7),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('analytics.full')
    const token = randomToken()
    await db.shareLink.create({
      data: {
        tokenHash: sha256(token),
        resource: 'analytics',
        params: JSON.stringify({ period: body.period, from: body.from ?? null, to: body.to ?? null }),
        expiresAt: new Date(Date.now() + body.days * 86400000),
        createdBy: user.id,
      },
    })
    return { url: `/s/${token}`, expiresAt: new Date(Date.now() + body.days * 86400000).toISOString() }
  })
}
