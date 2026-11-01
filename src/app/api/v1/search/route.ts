import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { searchEverything } from '@/services/tickets'

export async function GET(req: NextRequest) {
  const q = searchParams(req).get('q') ?? ''
  return handler(req, async () => {
    await requireCapability('search.use')
    return await searchEverything(q)
  })
}
