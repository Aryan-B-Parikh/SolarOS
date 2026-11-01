import { NextRequest, NextResponse } from 'next/server'

// Printed QR labels encode an absolute URL to the public warranty page. The
// app is hash-routed (the page renders from #/w/:code), so the path form
// /w/:code — used by labels printed before the hash-form fix — redirects to
// the hash route that actually renders the page (FR-5.2/FR-5.9).
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const url = req.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  url.hash = `#/w/${code}`
  return NextResponse.redirect(url, 302)
}
