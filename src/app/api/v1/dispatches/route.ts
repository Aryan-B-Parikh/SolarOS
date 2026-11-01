import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { dispatchQueue } from '@/services/dispatch'

export async function GET(req: NextRequest) {
  const status = searchParams(req).get('status') ?? undefined
  return handler(req, async () => {
    await requireCapability('stock.read')
    return { dispatches: await dispatchQueue(status) }
  })
}
