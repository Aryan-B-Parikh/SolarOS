// Object storage (T3): S3 / MinIO / Cloudflare R2 compatible PUT/GET with AWS
// Signature Version 4, implemented with node:crypto only (no AWS SDK), plus an
// automatic DB fallback: every call reports which backend holds the bytes so
// the caller can persist a MediaBlob row when object storage is unreachable.
//
// URL style: path-style (${S3_ENDPOINT}/${S3_BUCKET}/${key}) — works with
// MinIO and R2 out of the box, and with AWS S3 when the endpoint is empty.
// Header-based SigV4 is used for PUT/GET; a query-string presigned URL
// (X-Amz-Algorithm=…&X-Amz-Signature=…) is available for direct browser
// downloads, though the API routes proxy streams by default so the DB
// fallback keeps working end-to-end.

import { createHash, createHmac } from 'crypto'

const S3_ENDPOINT = (process.env.S3_ENDPOINT ?? '').replace(/\/+$/, '')
const S3_BUCKET = process.env.S3_BUCKET ?? ''
const S3_REGION = process.env.S3_REGION || 'auto'
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? ''
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? ''

const TIMEOUT_MS = 8000
const SERVICE = 's3'

export function isS3Configured(): boolean {
  return Boolean(S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)
}

// ── observability ────────────────────────────────────────────────
// The last S3 failure is kept in memory (and logged) so the S3 attempt is
// verifiable even when it silently falls back to the DB blob path.
export interface S3ErrorRecord {
  op: 'PUT' | 'GET'
  key: string
  message: string
  at: string
}
let lastS3Error: S3ErrorRecord | null = null

export function getLastS3Error(): S3ErrorRecord | null {
  return lastS3Error
}

function recordFailure(op: 'PUT' | 'GET', key: string, message: string): void {
  lastS3Error = { op, key, message, at: new Date().toISOString() }
  // one concise line per failure — lands in dev.log, never contains secrets
  console.warn(`[storage] S3 ${op} ${key} failed (${message}) — using DB fallback`)
}

// ── AWS SigV4 primitives ─────────────────────────────────────────

/** RFC 3986 URI-encode; keep '/' when encoding a path (encodePath=true) */
function uriEncode(value: string, encodePath = false): string {
  let out = ''
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch
    else if (ch === '/' && !encodePath) out += '/'
    else out += '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

/** signing key chain: AWS4-HMAC-SHA256Credential/date/region/service/aws4_request */
function signingKey(dateStamp: string): Buffer {
  const kDate = hmac('AWS4' + S3_SECRET_ACCESS_KEY, dateStamp)
  const kRegion = hmac(kDate, S3_REGION)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

function amzTimestamp(): { amzDate: string; dateStamp: string } {
  // 20260101T123456Z / 20260101 (UTC, second resolution)
  const iso = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { amzDate: iso, dateStamp: iso.slice(0, 8) }
}

function canonicalRequest(
  method: string,
  canonicalUri: string,
  canonicalQuery: string,
  canonicalHeaders: string,
  signedHeaders: string,
  payloadHash: string
): string {
  return [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
}

function stringToSign(amzDate: string, dateStamp: string, request: string): string {
  const scope = `${dateStamp}/${S3_REGION}/${SERVICE}/aws4_request`
  return ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(request)].join('\n')
}

function signRequest(amzDate: string, dateStamp: string, request: string): string {
  return hmac(signingKey(dateStamp), stringToSign(amzDate, dateStamp, request)).toString('hex')
}

/** header-string sort helper: "host;x-amz-content-sha256;x-amz-date" */
function signedHeadersOf(headers: Record<string, string>): { canonical: string; signed: string } {
  const names = Object.keys(headers).sort()
  const canonical = names.map((n) => `${n}:${headers[n].trim()}\n`).join('')
  return { canonical, signed: names.join(';') }
}

// ── public API ───────────────────────────────────────────────────

export type PutResult = { backend: 'S3' } | { backend: 'DB'; reason: string }

/**
 * PUT an object to object storage. NEVER throws: any failure (network error,
 * timeout, non-2xx status) resolves as { backend: 'DB' } so the caller stores
 * the bytes as a MediaBlob row instead.
 */
export async function putObject(key: string, contentType: string, buffer: Buffer): Promise<PutResult> {
  if (!isS3Configured()) return { backend: 'DB', reason: 'S3 not configured' }
  const { amzDate, dateStamp } = amzTimestamp()
  const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${uriEncode(key, true)}`)
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: url.host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
  }
  const { canonical, signed } = signedHeadersOf(headers)
  const request = canonicalRequest('PUT', url.pathname, '', canonical, signed, 'UNSIGNED-PAYLOAD')
  const signature = signRequest(amzDate, dateStamp, request)
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-date': amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY_ID}/${dateStamp}/${S3_REGION}/${SERVICE}/aws4_request, SignedHeaders=${signed}, Signature=${signature}`,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200)
      recordFailure('PUT', key, `HTTP ${res.status} ${body || res.statusText}`)
      return { backend: 'DB', reason: `S3 PUT returned HTTP ${res.status}` }
    }
    return { backend: 'S3' }
  } catch (err) {
    recordFailure('PUT', key, err instanceof Error ? err.message : String(err))
    return { backend: 'DB', reason: 'S3 unreachable' }
  }
}

export interface S3Object {
  buffer: Buffer
  contentType: string | null
}

/**
 * GET an object from object storage, or null when storage is not configured,
 * the object is missing or the request fails (caller should then try the DB
 * blob / legacy disk path).
 */
export async function getObject(key: string): Promise<S3Object | null> {
  if (!isS3Configured()) return null
  const { amzDate, dateStamp } = amzTimestamp()
  const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${uriEncode(key, true)}`)
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
  }
  const { canonical, signed } = signedHeadersOf(headers)
  const request = canonicalRequest('GET', url.pathname, '', canonical, signed, 'UNSIGNED-PAYLOAD')
  const signature = signRequest(amzDate, dateStamp, request)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-date': amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY_ID}/${dateStamp}/${S3_REGION}/${SERVICE}/aws4_request, SignedHeaders=${signed}, Signature=${signature}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200)
      recordFailure('GET', key, `HTTP ${res.status} ${body || res.statusText}`)
      return null
    }
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') }
  } catch (err) {
    recordFailure('GET', key, err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Query-string presigned GET URL (X-Amz-Algorithm/Signature). Exported for
 * future direct-to-S3 browser downloads; the API routes proxy streams by
 * default so the DB fallback keeps working without extra round-trips.
 */
export function presignedGetUrl(key: string, expiresInSec = 900): string | null {
  if (!isS3Configured()) return null
  const { amzDate, dateStamp } = amzTimestamp()
  const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${uriEncode(key, true)}`)
  const scope = `${dateStamp}/${S3_REGION}/${SERVICE}/aws4_request`
  // canonical query string: params sorted by key, values URI-encoded
  const query = new Map<string, string>([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${S3_ACCESS_KEY_ID}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.min(expiresInSec, 604800)))],
    ['X-Amz-SignedHeaders', 'host'],
  ])
  const canonicalQuery = [...query.entries()]
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .sort()
    .join('&')
  const canonicalHeaders = `host:${url.host}\n`
  const request = canonicalRequest('GET', url.pathname, canonicalQuery, canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD')
  const signature = signRequest(amzDate, dateStamp, request)
  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
