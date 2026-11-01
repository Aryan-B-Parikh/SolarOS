import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { db } from '@/lib/db'
import { sha256 } from '@/lib/auth'
import { dashboard } from '@/services/analytics'

// FR-8.6: read-only, expiring dashboard snapshot resolved from a share token.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return handler(_req, async () => {
    const link = await db.shareLink.findUnique({ where: { tokenHash: sha256(token) } })
    if (!link || link.resource !== 'analytics') throw new AppError('LINK_EXPIRED', 'This share link is not valid.')
    if (link.revokedAt || link.expiresAt < new Date()) throw new AppError('LINK_EXPIRED', 'This share link has expired.')
    const params = JSON.parse(link.params || '{}') as { period: string; from: string | null; to: string | null }
    const period = (['today', 'week', 'month', 'all', 'custom'].includes(params.period) ? params.period : 'month') as 'today' | 'week' | 'month' | 'all' | 'custom'
    const data = await dashboard(period, params.from && params.to ? { from: params.from, to: params.to } : undefined)
    return { share: { expiresAt: link.expiresAt.toISOString() }, dashboard: data }
  })
}
