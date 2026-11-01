// D14 + T3: photos, signatures and documents live in private storage. Access
// is granted only through (a) a presigned 5-minute URL issued after a token
// check, or (b) an authenticated staff session, or (c) a valid portal/quote
// token passed by the caller AND ownership of the attachment by that customer.
//
// T3 hardening:
//  - no credential at all (or a garbage/expired token) → 401
//  - a valid portal token for the WRONG customer → 404 (never leak existence)
//  - staged "pending:*" portal uploads are no longer world-readable by every
//    portal customer — they become reachable only after portalRaiseTicket
//    re-points them to the customer's own ticket
//  - bytes are served from object storage (S3) with a MediaBlob/legacy-disk
//    fallback, behind a path-traversal guard, with nosniff + disposition
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFile } from 'fs/promises'
import path from 'path'
import { getSessionUser } from '@/lib/auth'
import { verifyLink } from '@/lib/access-links'
import { verifyFileSignature } from '@/lib/signed-url'
import { getObject } from '@/lib/storage'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const url = new URL(req.url)
  const exp = url.searchParams.get('exp')
  const sig = url.searchParams.get('sig')
  const token = url.searchParams.get('t')
  const download = url.searchParams.get('download') === '1'

  let allowed = false

  // 1) presigned signature (issued server-side after an auth check, 5-min TTL)
  if (verifyFileSignature(id, exp, sig)) {
    allowed = true
  }

  // 2) staff session (any logged-in employee can view photos for their work)
  if (!allowed) {
    const user = await getSessionUser()
    if (user) allowed = true
  }

  // 3) customer token with an ownership check
  if (!allowed && token) {
    const link = await verifyLink(token, 'PORTAL').catch(() => null)
    const quoteLink = link ? null : await verifyLink(token, 'QUOTE').catch(() => null)
    const customerId = link?.customerId ?? quoteLink?.customerId
    if (customerId) {
      const attachment = await db.attachment.findUnique({ where: { id } })
      if (!attachment || !(await ownsAttachment(customerId, attachment))) {
        // valid token, but this file is not (or may not be) theirs
        return new NextResponse('Not found', { status: 404 })
      }
      allowed = true
    }
  }

  if (!allowed) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'This file is private. Sign in or open it from your SunPower link.', requestId: 'files' } },
      { status: 401 }
    )
  }

  const attachment = await db.attachment.findUnique({ where: { id }, include: { mediaBlob: true } })
  if (!attachment) return new NextResponse('Not found', { status: 404 })

  const safeName = (attachment.storageKey.split('/').pop() ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '') || 'file'
  const headers: Record<string, string> = {
    'Content-Type': attachment.mime,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  }

  // S3 backend: stream from object storage; if that fails, fall back to any
  // MediaBlob copy that exists (belt & braces)
  if (attachment.storage === 'S3') {
    const obj = await getObject(attachment.storageKey)
    if (obj) {
      return new NextResponse(new Uint8Array(obj.buffer), {
        headers: { ...headers, 'Content-Type': obj.contentType || attachment.mime },
      })
    }
  }

  // DB backend (automatic fallback at upload time) or S3-down rescue copy
  if (attachment.mediaBlob) {
    return new NextResponse(new Uint8Array(attachment.mediaBlob.bytes), { headers })
  }
  if (attachment.storage === 'DB') return new NextResponse('Missing', { status: 404 })

  // legacy rows (storage = null): bytes on local disk under db/uploads/
  try {
    const uploadsRoot = path.join(process.cwd(), 'db', 'uploads')
    const resolved = path.resolve(process.cwd(), attachment.storageKey)
    if (!resolved.startsWith(uploadsRoot + path.sep)) {
      return new NextResponse('Not found', { status: 404 })
    }
    const buf = await readFile(resolved)
    return new NextResponse(new Uint8Array(buf), { headers })
  } catch {
    return new NextResponse('Missing', { status: 404 })
  }
}

async function ownsAttachment(customerId: string, attachment: { ownerType: string; ownerId: string }): Promise<boolean> {
  if (attachment.ownerType === 'INSTALLATION') {
    const inst = await db.installation.findUnique({ where: { id: attachment.ownerId }, include: { order: true } })
    return inst?.order.customerId === customerId
  }
  if (attachment.ownerType === 'SURVEY') {
    const survey = await db.siteSurvey.findUnique({ where: { id: attachment.ownerId }, include: { lead: true } })
    return survey?.lead.customerId === customerId
  }
  if (attachment.ownerType === 'WARRANTY') {
    const warranty = await db.warranty.findUnique({ where: { id: attachment.ownerId } })
    return warranty?.customerId === customerId
  }
  if (attachment.ownerType === 'TICKET') {
    // staged "pending:*" portal uploads carry no customer link yet — denying
    // them here is the safe default (the portal previews them from the local
    // File objects, and they become owned once re-pointed to the real ticket)
    if (attachment.ownerId.startsWith('pending:')) return false
    const ticket = await db.serviceTicket.findUnique({ where: { id: attachment.ownerId } })
    return ticket?.customerId === customerId
  }
  // EXPENSE and anything else: internal records, staff-only
  return false
}
