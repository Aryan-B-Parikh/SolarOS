// Customer access links: 128-bit random tokens, SHA-256 hash stored, expiry,
// revocation, last-four verification with lockout (D11, TRD 2.6).
//
// One persistent My SunPower page per customer (P27): issuing a PORTAL link
// never revokes the previous one — an active link is re-sent as-is so the
// customer's bookmarked page keeps working. The raw token is sealed with
// AES-256-GCM so staff can re-display/re-send the SAME link without being
// able to forge arbitrary tokens. Quote and certificate links are per-document
// and simply age out (quote validity + 30 days).

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'
import { db } from '@/lib/db'
import { sha256 } from '@/lib/auth'
import { AppError } from '@/lib/errors'

export type LinkScope = 'PORTAL' | 'QUOTE' | 'CERTIFICATE'

const ENC_KEY = createHash('sha256')
  .update(process.env.AUTH_SECRET ?? 'sunpower-demo-signing-secret')
  .digest()

export function generateToken(): string {
  return randomBytes(16).toString('base64url') // 128-bit
}

function sealToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), enc.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

function openToken(sealed: string | null | undefined): string | null {
  if (!sealed) return null
  try {
    const [ivB64, dataB64, tagB64] = sealed.split('.')
    const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export async function issueLink(
  customerId: string,
  scope: LinkScope,
  createdBy: string | null,
  ttlDays = 90
): Promise<{ token: string; linkId: string; reused: boolean }> {
  if (scope === 'PORTAL') {
    // P27 "one persistent page": reuse the active link instead of replacing it.
    const active = await db.customerAccessLink.findFirst({
      where: { customerId, scope, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    const token = openToken(active?.tokenEnc)
    if (active && token) return { token, linkId: active.id, reused: true }
  }
  const token = generateToken()
  // Portal-link security fix (prior audit): whenever a NEW portal link is
  // minted — e.g. the public enquiry flow for an existing customer whose
  // previous link could not be re-sealed — every still-active link for that
  // customer is revoked in the SAME transaction. Exactly one active portal
  // link may exist per customer, so an old (possibly leaked) token dies the
  // instant its replacement is issued. QUOTE/CERTIFICATE links are
  // per-document and simply age out.
  const link = await db.$transaction(async (tx) => {
    if (scope === 'PORTAL') {
      await tx.customerAccessLink.updateMany({
        where: { customerId, scope, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return tx.customerAccessLink.create({
      data: {
        customerId,
        scope,
        tokenHash: sha256(token),
        tokenEnc: sealToken(token),
        expiresAt: new Date(Date.now() + ttlDays * 86400000),
        createdBy,
      },
    })
  })
  return { token, linkId: link.id, reused: false }
}

/** explicit revocation only (staff action) — links are never silently replaced */
export async function revokeLink(linkId: string): Promise<void> {
  await db.customerAccessLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } })
}

/** seal a token that was issued before tokenEnc existed (migration helper) */
export async function backfillTokenEnc(linkId: string, token: string): Promise<void> {
  await db.customerAccessLink.update({ where: { id: linkId }, data: { tokenEnc: sealToken(token) } })
}

export interface VerifiedLink {
  linkId: string
  customerId: string
  scope: LinkScope
}

export async function verifyLink(token: string, scope: LinkScope): Promise<VerifiedLink> {
  const link = await db.customerAccessLink.findUnique({
    where: { tokenHash: sha256(token) },
  })
  if (!link || link.scope !== scope) throw new AppError('LINK_EXPIRED', 'This link is not valid.')
  if (link.revokedAt) throw new AppError('LINK_EXPIRED', 'This link was revoked. Please ask SunPower for a fresh link.')
  if (link.expiresAt < new Date()) throw new AppError('LINK_EXPIRED', 'This link has expired. Please request a fresh link.')
  if (link.lockedUntil && link.lockedUntil > new Date()) {
    throw new AppError('LINK_LOCKED', 'Too many wrong attempts. This link is locked for 15 minutes.')
  }
  await db.customerAccessLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } })
  return { linkId: link.id, customerId: link.customerId, scope }
}

/** last-4 phone verification for sensitive portal actions; 5 wrong tries lock 15 min */
export async function verifyPhoneDigits(link: VerifiedLink, last4: string, customerPhone: string): Promise<boolean> {
  if (last4 !== customerPhone.slice(-4)) {
    const failed = (await db.customerAccessLink.findUnique({ where: { id: link.linkId } }))!.failedAttempts + 1
    await db.customerAccessLink.update({
      where: { id: link.linkId },
      data: {
        failedAttempts: failed,
        lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60000) : null,
      },
    })
    return false
  }
  await db.customerAccessLink.update({ where: { id: link.linkId }, data: { failedAttempts: 0 } })
  return true
}

/** find the currently active portal link row for a customer (null if none) */
export async function activePortalLink(customerId: string) {
  return db.customerAccessLink.findFirst({
    where: { customerId, scope: 'PORTAL', revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
}
