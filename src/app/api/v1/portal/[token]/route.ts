import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { portalBundle } from '@/services/portal'

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return handler(req, async () => portalBundle(token))
}
