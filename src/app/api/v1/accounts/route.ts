import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { accountsOverview } from '@/services/analytics'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('payments.read')
    return await accountsOverview()
  })
}
