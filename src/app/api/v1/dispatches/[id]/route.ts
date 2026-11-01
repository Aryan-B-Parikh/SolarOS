import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { dispatchDetail } from '@/services/dispatch'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('stock.read')
    return { dispatch: await dispatchDetail(id) }
  })
}
