import { NextRequest, NextResponse } from 'next/server'
import { handler } from '@/lib/api'
import { rateLimit } from '@/lib/auth'
import { publicWarrantyPage } from '@/services/portal'

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit('warranty:' + ip, 30, 60000)) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests.', requestId: 'rate' } }, { status: 429 })
  }
  return handler(req, async () => {
    const page = await publicWarrantyPage(decodeURIComponent(code))
    return page
  })
}
