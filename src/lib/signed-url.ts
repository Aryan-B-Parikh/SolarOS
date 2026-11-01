// Presigned file URLs (D14): photos, signatures and documents live in private
// storage; the portal and public pages may only fetch them through short-lived
// signed GET URLs issued AFTER the token check. Signatures expire in 5 minutes.

import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.AUTH_SECRET ?? 'sunpower-demo-signing-secret'
const DEFAULT_TTL_SECONDS = 300 // 5 minutes

export function presignFile(attachmentId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Date.now() + ttlSeconds * 1000
  const sig = sign(attachmentId, String(exp))
  return `/api/v1/files/${attachmentId}?exp=${exp}&sig=${sig}`
}

export function verifyFileSignature(attachmentId: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false
  const expected = Buffer.from(sign(attachmentId, exp))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

function sign(attachmentId: string, exp: string): string {
  return createHmac('sha256', SECRET).update(`${attachmentId}.${exp}`).digest('base64url')
}
