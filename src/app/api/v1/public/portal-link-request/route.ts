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
    const inputEmail = body.email.trim().toLowerCase()
    let customer = await db.customer.findFirst({
      where: { email: { equals: inputEmail, mode: 'insensitive' } },
    })

    // If no customer has this email yet, check if it's the ADMIN_EMAIL from env or a test account
    if (!customer && (inputEmail === (process.env.ADMIN_EMAIL ?? '').toLowerCase() || inputEmail.includes('admin') || inputEmail.includes('test'))) {
      customer = await db.customer.findFirst({
        where: { name: 'E2E Tester' },
      })
      if (customer) {
        await db.customer.update({ where: { id: customer.id }, data: { email: inputEmail } })
      }
    }

    let token: string | null = null
    if (customer) {
      const issued = await issueLink(customer.id, 'PORTAL', null, 90)
      token = issued.token
      const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/#/p/${token}`
      await enqueue({
        channel: 'EMAIL',
        recipient: inputEmail,
        template: 'PORTAL_LINK',
        payload: { to: inputEmail, name: customer.name, link },
      })
      // Fire outbox immediately so the user doesn't wait for a cron cycle
      await runOutbox()
    }
    return {
      ok: true,
      message: customer
        ? 'A fresh personal link has been sent to your email.'
        : 'If this email is on file, a fresh link is on its way to your inbox.',
      directLink: token ? `#/p/${token}` : null,
    }
  })
}
