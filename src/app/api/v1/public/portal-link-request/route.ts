import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { rateLimit } from '@/lib/auth'
import { db } from '@/lib/db'
import { issueLink } from '@/lib/access-links'
import { enqueue, runOutbox } from '@/lib/outbox'

const schema = z.object({ email: z.string().email() })

// Uniform response whether or not the address exists (TRD 2.6 — no enumeration)
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit('linkreq:' + ip, 3, 60000)) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests.', requestId: 'rate' } }, { status: 429 })
  }
  return handlerWithSchema(req, schema, async ({ body }) => {
    const customer = await db.customer.findFirst({ where: { email: body.email } })
    if (customer) {
      const { token } = await issueLink(customer.id, 'PORTAL', null, 90)
      const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/p/${token}`
      await enqueue({
        channel: 'EMAIL',
        recipient: body.email,
        template: 'PORTAL_LINK',
        payload: { to: body.email, name: customer.name, link },
      })
      // Fire outbox immediately so the user doesn't wait for a cron cycle
      void runOutbox()
    }
    return { ok: true, message: 'If this email is on file, a fresh link is on its way to your inbox.' }
  })
}
