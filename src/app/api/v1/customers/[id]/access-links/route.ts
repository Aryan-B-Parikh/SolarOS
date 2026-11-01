import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { issuePortalLink } from '@/services/portal'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    const user = await requireCapability('accessLinks.manage')
    const token = await issuePortalLink(id, user.id)
    return { token }
  })
}
