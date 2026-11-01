import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { technicianPaySummary } from '@/services/analytics'

export async function GET(req: NextRequest) {
  const month = searchParams(req).get('month') ?? new Date().toISOString().slice(0, 7)
  return handler(req, async () => {
    await requireCapability('analytics.full')
    return { month, technicians: await technicianPaySummary(month) }
  })
}
