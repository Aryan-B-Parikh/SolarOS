import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { dashboard } from '@/services/analytics'

export async function GET(req: NextRequest) {
  const sp = searchParams(req)
  const period = (sp.get('period') ?? 'month') as 'today' | 'week' | 'month' | 'all' | 'custom'
  const from = sp.get('from') ?? undefined
  const to = sp.get('to') ?? undefined
  return handler(req, async () => {
    await requireCapability('analytics.full')
    return await dashboard(period, from && to ? { from, to } : undefined)
  })
}
