import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError, errorBody } from '@/lib/errors'
import { createHash, randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'db', 'uploads')
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const rid = randomUUID().slice(0, 8)
  try {
    // NOTE: this route reads formData itself, so it must not go through the
    // generic handler wrapper (which consumes the body as JSON first).
    const form = await req.formData()
    const file = form.get('file') as File | null
    const ownerType = String(form.get('ownerType') ?? 'OTHER')
    const ownerId = String(form.get('ownerId') ?? 'none')
    const kind = String(form.get('kind') ?? 'OTHER')
    // FR-10.6: customers can attach photos to a service request from their
    // portal link — authenticated by the portal token instead of a session.
    // Portal uploads may only stage TICKET photos against a pending owner id,
    // which portalRaiseTicket re-points to the real ticket.
    const portalToken = String(form.get('portalToken') ?? '')
    let uploadedBy: string
    if (portalToken) {
      const { verifyLink } = await import('@/lib/access-links')
      await verifyLink(portalToken, 'PORTAL')
      if (ownerType !== 'TICKET' || !ownerId.startsWith('pending:')) {
        throw new AppError('VALIDATION_FAILED', 'Portal photos can only be attached to a service request.')
      }
      uploadedBy = 'PORTAL'
    } else {
      const user = await requireUser()
      uploadedBy = user.id
    }
    if (!file) throw new AppError('VALIDATION_FAILED', 'No file provided.')
    if (!ALLOWED.includes(file.type)) throw new AppError('VALIDATION_FAILED', 'Only JPEG, PNG and WebP are allowed.')
    if (file.size > MAX) throw new AppError('VALIDATION_FAILED', 'Files must be under 10 MB.')
    const buf = Buffer.from(await file.arrayBuffer())
    const sha = createHash('sha256').update(buf).digest('hex')
    await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const attachment = await db.attachment.create({
      data: {
        ownerType, ownerId, kind, storageKey: `db/uploads/${sha.slice(0, 32)}.${ext}`,
        mime: file.type, sizeBytes: buf.length, sha256: sha,
        takenAt: new Date(), uploadedBy,
      },
    })
    await writeFile(path.join(process.cwd(), attachment.storageKey), buf)
    return NextResponse.json({ attachmentId: attachment.id, url: `/api/v1/files/${attachment.id}` })
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(errorBody(err, rid), { status: err.status })
    }
    console.error(`[api:${rid}]`, err)
    return NextResponse.json(errorBody(err, rid), { status: 500 })
  }
}
