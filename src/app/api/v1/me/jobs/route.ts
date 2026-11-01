import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { myJobsToday } from '@/services/installations'

export async function GET(req: NextRequest) {
  const date = searchParams(req).get('date') ?? undefined
  return handler(req, async () => {
    const user = await requireUser()
    return await myJobsToday(user.id, date)
  })
}
