import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Private object storage abstraction (D14).
 *
 * The default driver stores objects on local disk under STORAGE_DIR
 * (default: ./.storage - NEVER under public/). Objects are only reachable
 * through the authenticated attachment endpoint, which issues short-lived
 * HMAC-signed URLs (the local-disk equivalent of presigned GETs).
 *
 * Swapping in S3/R2/MinIO later means implementing StorageDriver with the
 * same three methods - no route or service code changes.
 */

export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), '.storage');

async function ensureDirFor(key: string): Promise<string> {
  const target = path.join(STORAGE_ROOT, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  return target;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const target = await ensureDirFor(key);
    await fs.writeFile(target, data, { mode: 0o600 });
  },
  async get(key) {
    const target = path.join(STORAGE_ROOT, key);
    // Defence in depth: refuse path traversal
    if (!path.resolve(target).startsWith(STORAGE_ROOT)) {
      throw new Error('Invalid storage key');
    }
    return fs.readFile(target);
  },
  async delete(key) {
    const target = path.join(STORAGE_ROOT, key);
    if (!path.resolve(target).startsWith(STORAGE_ROOT)) return;
    await fs.rm(target, { force: true });
  },
};

const driver: StorageDriver = localDriver;

export const storage = {
  put: (key: string, data: Buffer, mime: string) => driver.put(key, data, mime),
  get: (key: string) => driver.get(key),
  delete: (key: string) => driver.delete(key),
};

/** Builds a storage key like `installations/<uuid>/after-<ts>-<rand>.jpg`. */
export function buildStorageKey(namespace: string, ownerId: string, originalName: string): string {
  const ext = (path.extname(originalName) || '.bin').toLowerCase().replace(/[^a-z0-9.]/g, '');
  const rand = crypto.randomBytes(6).toString('hex');
  return `${namespace}/${ownerId}/${Date.now()}-${rand}${ext}`;
}

// ── Signed URL helpers (presigned-GET equivalent for local storage) ─────────

const SIGNING_SECRET =
  process.env.ACCESS_LINK_SECRET || process.env.AUTH_SECRET || 'sunpower-default-dev-secret-key-32chars!!';

const SIGN_TTL_SECONDS = 15 * 60;

/** Creates an `expires.signature` pair for a storage key. */
export function signStorageKey(key: string, ttlSeconds = SIGN_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${key}.${expires}`)
    .digest('base64url');
  return `${expires}.${sig}`;
}

/** Verifies a signed storage key. Returns false when tampered or expired. */
export function verifyStorageSignature(key: string, signed: string): boolean {
  try {
    const [expiresStr, sig] = signed.split('.');
    const expires = parseInt(expiresStr, 10);
    if (!expires || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${key}.${expires}`)
      .digest('base64url');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** D14: upload constraints. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/** URL for embedding an attachment in a server-rendered page (short-lived signed link). */
export function signedAttachmentUrl(attachmentId: string, storageKey: string): string {
  return `/api/v1/attachments/${attachmentId}?sig=${encodeURIComponent(signStorageKey(storageKey))}`;
}
