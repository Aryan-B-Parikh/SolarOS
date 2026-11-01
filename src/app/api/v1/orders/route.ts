import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listOrders } from '@/services/orders'

export async function GET(req: NextRequest) {
  const status = searchParams(req).get('status') ?? undefined
  return handler(req, async () => {
    await requireCapability('payments.read')
    return { orders: await listOrders(status) }
  })
}
