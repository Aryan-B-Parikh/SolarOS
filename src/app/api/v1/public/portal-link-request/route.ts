import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { rateLimit } from '@/lib/auth'
import { db } from '@/lib/db'
import { issueLink } from '@/lib/access-links'
import { enqueue } from '@/lib/outbox'
import { normalizePhone } from '@/services/leads'

const schema = z.object({ phone: z.string().min(10) })

// uniform response whether or not the number exists (TRD 2.6)
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit('linkreq:' + ip, 3, 60000)) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests.', requestId: 'rate' } }, { status: 429 })
  }
  return handlerWithSchema(req, schema, async ({ body }) => {
    const phone = normalizePhone(body.phone)
    const customer = await db.customer.findUnique({ where: { phone } })
    if (customer) {
      const { token } = await issueLink(customer.id, 'PORTAL', null, 90)
      await enqueue({ channel: 'SMS', recipient: phone.slice(0, 6) + 'XXXX' + phone.slice(-3), template: 'PORTAL_LINK', payload: { to: phone, name: customer.name, link: `/p/${token}` } })
    }
    return { ok: true, message: 'If this number is on file, a fresh link is on its way by SMS.' }
  })
}
