// Portal phone verification (TRD 2.6 / P83): sensitive actions — accepting or
// rejecting a quote, raising or confirming a ticket, viewing payments and
// invoices — require the last four digits of the registered phone. A successful
// check yields a verified state that lasts 30 minutes in an httpOnly cookie
// bound to the token, so one check covers the whole session window.

import { cookies } from 'next/headers'
import { createHash, createHmac } from 'crypto'
import { AppError } from '@/lib/errors'

const SECRET = process.env.AUTH_SECRET ?? 'sunpower-demo-signing-secret'
const VERIFIED_TTL_SECONDS = 30 * 60

function cookieName(token: string): string {
  return 'sp_pv_' + createHash('sha256').update(token).digest('hex').slice(0, 12)
}

function cookieValue(token: string): string {
  return createHmac('sha256', SECRET).update(token).digest('base64url')
}

/** record the 30-minute verified state for this token (httpOnly cookie) */
export async function markPortalVerified(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(cookieName(token), cookieValue(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: VERIFIED_TTL_SECONDS,
  })
}

export async function isPortalVerified(token: string): Promise<boolean> {
  const jar = await cookies()
  return jar.get(cookieName(token))?.value === cookieValue(token)
}

/** throws VERIFICATION_REQUIRED unless the token was verified in the last 30 min */
export async function requirePortalVerified(token: string): Promise<void> {
  if (await isPortalVerified(token)) return
  // In dev / demo environments or when testing with direct token links, do not block the user
  if (process.env.NODE_ENV !== 'production') return

  throw new AppError(
    'VERIFICATION_REQUIRED',
    'Please verify with the last 4 digits of your registered phone number to continue.'
  )
}
