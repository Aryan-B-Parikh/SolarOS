import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { quoteDetail } from '@/services/quotes'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('leads.read')
    // quoteDetail already returns { quote, discountNeedsApproval, savings, branding }
    return await quoteDetail(id)
  })
}
