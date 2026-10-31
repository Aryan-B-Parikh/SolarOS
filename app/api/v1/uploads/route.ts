import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { AppError, formatErrorResponse } from '@/lib/errors';
import {
  storage,
  buildStorageKey,
  isAllowedMime,
  MAX_UPLOAD_BYTES,
} from '@/lib/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Private attachment upload (D14 / X-SEC-FILES).
 *
 * Staff-only (session cookie). Multipart form:
 *   file        - the binary (image/jpeg|png|webp or application/pdf, <= 10 MB)
 *   entityType  - LEAD | SURVEY | ORDER | INSTALLATION | TICKET | EXPENSE | PRODUCT
 *   entityId    - UUID of the owning record
 *   kind        - SURVEY | BEFORE | AFTER | ARRAY | INVERTER | EARTHING | SIGNATURE | RECEIPT | OTHER
 *   lat, lng    - optional GPS
 *   takenAt     - optional ISO timestamp
 *
 * Returns { id } - the Attachment UUID that downstream payloads reference
 * (photoAttachmentIds, signatureAttachmentId, ...).
 */

const EnumSchema = z.enum([
  'LEAD',
  'SURVEY',
  'ORDER',
  'INSTALLATION',
  'TICKET',
  'EXPENSE',
  'PRODUCT',
]);
const KindSchema = z.enum([
  'SURVEY',
  'BEFORE',
  'AFTER',
  'ARRAY',
  'INVERTER',
  'EARTHING',
  'SIGNATURE',
  'RECEIPT',
  'OTHER',
]);

const NAMESPACE_BY_TYPE: Record<string, string> = {
  LEAD: 'leads',
  SURVEY: 'surveys',
  ORDER: 'orders',
  INSTALLATION: 'installations',
  TICKET: 'tickets',
  EXPENSE: 'expenses',
  PRODUCT: 'products',
};

export async function POST(req: NextRequest) {
  const requestId = `upload-${Date.now().toString(36)}`;
  try {
    const user = await getSessionUser();
    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      throw new AppError('VALIDATION_FAILED', 'Multipart form data required', 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AppError('VALIDATION_FAILED', 'file field is required', 400);
    }

    const entityType = EnumSchema.safeParse(form.get('entityType'));
    const entityId = z.string().uuid().safeParse(form.get('entityId'));
    const kind = KindSchema.safeParse(form.get('kind') || 'OTHER');
    if (!entityType.success || !entityId.success) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Valid entityType (enum) and entityId (UUID) are required',
        400
      );
    }

    const mime = file.type || 'application/octet-stream';
    if (!isAllowedMime(mime)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Unsupported file type ${mime}. Allowed: JPEG, PNG, WebP, PDF.`,
        400
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'File exceeds the 10 MB limit', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    const key = buildStorageKey(
      NAMESPACE_BY_TYPE[entityType.data],
      entityId.data,
      file.name || 'upload.bin'
    );
    await storage.put(key, buffer, mime);

    const latRaw = form.get('lat');
    const lngRaw = form.get('lng');
    const takenAtRaw = form.get('takenAt');
    const lat = latRaw && !Number.isNaN(Number(latRaw)) ? String(latRaw) : null;
    const lng = lngRaw && !Number.isNaN(Number(lngRaw)) ? String(lngRaw) : null;
    const takenAt = takenAtRaw && !Number.isNaN(Date.parse(String(takenAtRaw))) ? new Date(String(takenAtRaw)) : null;

    const attachment = await prisma.attachment.create({
      data: {
        owner_type: entityType.data,
        owner_id: entityId.data,
        kind: kind.success ? kind.data : 'OTHER',
        storage_key: key,
        mime,
        size_bytes: BigInt(buffer.length),
        sha256,
        uploaded_by: user.id,
        ...(lat ? { lat } : {}),
        ...(lng ? { lng } : {}),
        ...(takenAt ? { taken_at: takenAt } : {}),
      },
    });

    logger.info('Attachment uploaded', {
      requestId,
      attachmentId: attachment.id,
      ownerType: entityType.data,
      bytes: buffer.length,
    });

    return NextResponse.json(
      {
        id: attachment.id,
        attachmentId: attachment.id,
        kind: attachment.kind,
        mime,
        sizeBytes: buffer.length,
      },
      { status: 201 }
    );
  } catch (err) {
    const { status, body } = formatErrorResponse(err, requestId);
    return NextResponse.json(body, { status });
  }
}
