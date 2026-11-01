import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { orderDetail } from '@/services/orders'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('payments.read')
    return { order: await orderDetail(id) }
  })
}
