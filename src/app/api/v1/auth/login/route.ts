import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { login, rateLimit } from '@/lib/auth'

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: NextRequest) {
  // brute-force damper on top of the per-account lockout (10 tries -> 15 min)
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit(`login:${ip}`, 20, 60000)) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait a minute and try again.', requestId: 'login' } },
      { status: 429 }
    )
  }
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await login(body.email, body.password)
    return { user }
  })
}
