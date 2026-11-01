// File upload API (T3): staff upload binary files (ticket photos, documents)
// as base64 JSON. Bytes go to object storage first (S3/MinIO/R2 via SigV4);
// when that is unreachable the bytes are stored in the MediaBlob SQLite table
// so the upload never hard-fails. The response is the Attachment row plus its
// serving URL (GET /api/v1/files/{id}).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'
import { handlerWithSchema } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { putObject } from '@/lib/storage'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB decoded
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const ENTITY_TYPES = ['TICKET', 'SURVEY', 'INSTALLATION', 'WARRANTY', 'EXPENSE'] as const
const KINDS = ['SURVEY', 'BEFORE', 'AFTER', 'ARRAY', 'INVERTER', 'EARTHING', 'SIGNATURE', 'EXTRA', 'OTHER'] as const

const schema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  filename: z.string().min(1).max(200),
  contentType: z.enum(ALLOWED_CONTENT_TYPES as [string, ...string[]]),
  dataBase64: z.string().max(12 * 1024 * 1024), // > 8 MB decoded can never pass
  kind: z.enum(KINDS).optional(),
})

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    // any authenticated staff member can attach photos to their work
    const user = await requireUser()

    const dataBase64 = body.dataBase64.replace(/\s+/g, '')
    if (!BASE64_RE.test(dataBase64) || dataBase64.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'The file payload is not valid base64.')
    }
    const buffer = Buffer.from(dataBase64, 'base64')
    if (buffer.length === 0) throw new AppError('VALIDATION_FAILED', 'The file is empty.')
    if (buffer.length > MAX_BYTES) throw new AppError('VALIDATION_FAILED', 'Files must be under 8 MB.')

    // the target entity must exist — no orphan photo rows
    await assertEntityExists(body.entityType, body.entityId)

    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+$/, '').slice(0, 120) || 'file'
    const key = `${body.entityType.toLowerCase()}/${body.entityId}/${randomUUID()}-${safeName}`

    const put = await putObject(key, body.contentType, buffer)
    const attachment = await db.attachment.create({
      data: {
        ownerType: body.entityType,
        ownerId: body.entityId,
        kind: body.kind ?? 'OTHER',
        storageKey: key,
        mime: body.contentType,
        sizeBytes: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        takenAt: new Date(),
        uploadedBy: user.id,
        storage: put.backend,
        ...(put.backend === 'DB' ? { mediaBlob: { create: { bytes: buffer } } } : {}),
      },
      include: { mediaBlob: true },
    })

    return {
      file: {
        id: attachment.id,
        ownerType: attachment.ownerType,
        ownerId: attachment.ownerId,
        kind: attachment.kind,
        storage: attachment.storage,
        storageKey: attachment.storageKey,
        contentType: attachment.mime,
        sizeBytes: attachment.sizeBytes,
        sha256: attachment.sha256,
        createdAt: attachment.createdAt,
        url: `/api/v1/files/${attachment.id}`,
      },
    }
  })
}

async function assertEntityExists(entityType: (typeof ENTITY_TYPES)[number], entityId: string): Promise<void> {
  let exists = false
  if (entityType === 'TICKET') exists = Boolean(await db.serviceTicket.findUnique({ where: { id: entityId } }))
  else if (entityType === 'SURVEY') exists = Boolean(await db.siteSurvey.findUnique({ where: { id: entityId } }))
  else if (entityType === 'INSTALLATION') exists = Boolean(await db.installation.findUnique({ where: { id: entityId } }))
  else if (entityType === 'WARRANTY') exists = Boolean(await db.warranty.findUnique({ where: { id: entityId } }))
  else if (entityType === 'EXPENSE') exists = Boolean(await db.expense.findUnique({ where: { id: entityId } }))
  if (!exists) throw new AppError('NOT_FOUND', `No ${entityType.toLowerCase()} found for this upload.`)
}
