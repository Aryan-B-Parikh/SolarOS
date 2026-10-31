import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Private object storage abstraction (D14).
 *
 * Supports both S3/R2/MinIO cloud object storage with 5-minute presigned GET URLs
 * and a zero-dependency local disk driver with short-lived HMAC-signed URLs.
 */

export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getPresignedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
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

// S3 / Cloudflare R2 / MinIO Storage Driver (ADR D14)
const S3_BUCKET = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
const S3_REGION = process.env.AWS_REGION || process.env.S3_REGION || 'ap-south-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;

let s3Driver: StorageDriver | null = null;
if (S3_BUCKET) {
  const s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  s3Driver = {
    async put(key, data, mime) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: data,
          ContentType: mime,
        })
      );
    },
    async get(key) {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
      if (!response.Body) throw new Error(`Empty body for key ${key}`);
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    },
    async delete(key) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
    },
    async getPresignedUrl(key, expiresInSeconds = 300) {
      return getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }),
        { expiresIn: expiresInSeconds }
      );
    },
  };
}

const driver: StorageDriver = s3Driver || localDriver;

export const storage = {
  put: (key: string, data: Buffer, mime: string) => driver.put(key, data, mime),
  get: (key: string) => driver.get(key),
  delete: (key: string) => driver.delete(key),
  getPresignedUrl: (key: string, expiresInSeconds = 300) =>
    driver.getPresignedUrl
      ? driver.getPresignedUrl(key, expiresInSeconds)
      : Promise.resolve(null),
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

const SIGN_TTL_SECONDS = 5 * 60; // 5-minute presigned GET per spec D14

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
