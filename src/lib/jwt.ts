import type { Role } from './rbac.ts';

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  isFieldDevice?: boolean;
  sessionId?: string;
  iat?: number; // seconds
  exp?: number; // seconds
}

export const SESSION_COOKIE_NAME = 'sunpower_session';
export const STAFF_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 idle hours (Spec 2.6)
export const FIELD_DEVICE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days (Spec 2.6)

const DEFAULT_SECRET = process.env.AUTH_SECRET || 'sunpower-ops-default-jwt-secret-key-32chars!';

/**
 * Pure TypeScript SHA-256 implementation compliant with FIPS 180-4.
 * Operates across Node.js, Next.js Edge Runtime, and browser environments without Node 'crypto'.
 */
function sha256(bytes: Uint8Array): Uint8Array {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  const k: number[] = [];
  const h: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = true;
      h[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  const words: number[] = [];
  const wordsLength = ((bytes.length + 8) >> 6) + 1;
  for (i = 0; i < wordsLength * 16; i++) words[i] = 0;
  for (i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[wordsLength * 16 - 1] = bytes.length * 8;

  const hash = h.slice(0);
  for (j = 0; j < wordsLength * 16; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = a;
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  const result = new Uint8Array(32);
  for (i = 0; i < 8; i++) {
    result[i * 4] = (hash[i] >>> 24) & 0xff;
    result[i * 4 + 1] = (hash[i] >>> 16) & 0xff;
    result[i * 4 + 2] = (hash[i] >>> 8) & 0xff;
    result[i * 4 + 3] = hash[i] & 0xff;
  }
  return result;
}

/**
 * Pure HMAC-SHA256 (RFC 2104) producing base64url output.
 */
function hmacSha256Base64Url(keyStr: string, msgStr: string): string {
  const encoder = new TextEncoder();
  let key = encoder.encode(keyStr);
  const msg = encoder.encode(msgStr);
  const blockSize = 64;
  if (key.length > blockSize) key = sha256(key);
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(key);
  const oPad = new Uint8Array(blockSize);
  const iPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oPad[i] = paddedKey[i] ^ 0x5c;
    iPad[i] = paddedKey[i] ^ 0x36;
  }
  const innerMsg = new Uint8Array(blockSize + msg.length);
  innerMsg.set(iPad);
  innerMsg.set(msg, blockSize);
  const innerHash = sha256(innerMsg);

  const outerMsg = new Uint8Array(blockSize + 32);
  outerMsg.set(oPad);
  outerMsg.set(innerHash, blockSize);
  const outerHash = sha256(outerMsg);

  let bin = '';
  for (let i = 0; i < outerHash.length; i++) bin += String.fromCharCode(outerHash[i]);
  const b64 = (typeof btoa === 'function' ? btoa(bin) : Buffer.from(outerHash).toString('base64'));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Constant-time string equality check to prevent timing attacks.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Base64url encoding and decoding utilities
 */
function base64UrlEncode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64url');
  }
  const bin = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  return decodeURIComponent(
    bin.split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
}

/**
 * Signs a payload into an RFC 7519 compliant HS256 JWT
 */
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secretKey: string = DEFAULT_SECRET,
  expiresInSeconds?: number
): string {
  const isField = Boolean(payload.isFieldDevice);
  const ttl = expiresInSeconds ?? (isField ? FIELD_DEVICE_SESSION_TTL_SECONDS : STAFF_SESSION_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + ttl,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSha256Base64Url(secretKey, dataToSign);

  return `${dataToSign}.${signature}`;
}

/**
 * Verifies an HS256 JWT and returns the parsed payload if valid, or null if invalid/expired
 */
export function verifyJwt(
  token: string,
  secretKey: string = DEFAULT_SECRET
): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    // 1. Verify header algorithm
    const headerJson = JSON.parse(base64UrlDecode(headerB64));
    if (headerJson.alg !== 'HS256') return null;

    // 2. Verify signature with constant-time equality
    const dataToSign = `${headerB64}.${payloadB64}`;
    const expectedSignature = hmacSha256Base64Url(secretKey, dataToSign);

    if (!constantTimeEquals(signatureB64, expectedSignature)) {
      return null;
    }

    // 3. Verify payload and expiration
    const payload: JwtPayload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp <= now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Builds Set-Cookie string for the session cookie
 */
export function generateSessionCookie(
  token: string,
  isFieldDevice: boolean = false
): string {
  const maxAge = isFieldDevice ? FIELD_DEVICE_SESSION_TTL_SECONDS : STAFF_SESSION_TTL_SECONDS;
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

/**
 * Builds Set-Cookie string to clear the session cookie
 */
export function generateClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * Extracts JWT token from cookie or Authorization header
 */
export function extractToken(
  cookieHeader?: string | null,
  authHeader?: string | null
): string | null {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
        return cookie.substring(SESSION_COOKIE_NAME.length + 1).trim();
      }
      // Also accept next-auth / fallback cookie names
      if (cookie.startsWith('next-auth.session-token=')) {
        return cookie.substring('next-auth.session-token='.length).trim();
      }
    }
  }

  return null;
}

// -------------------------------------------------------------
// Account Lockout Engine (TRD Section 2.6)
// "10 failed logins lock the account for 15 minutes."
// -------------------------------------------------------------

export interface LockoutRecord {
  failedAttempts: number[];
  lockedUntil: number | null;
}

export const LOCKOUT_MAX_ATTEMPTS = 10;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const lockoutStore = new Map<string, LockoutRecord>();

/**
 * Normalizes email identifier for lockout tracking
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checks if an account is currently locked out
 */
export function checkAccountLockout(email: string): {
  locked: boolean;
  remainingSeconds?: number;
  remainingMinutes?: number;
} {
  const key = normalizeEmail(email);
  const record = lockoutStore.get(key);
  if (!record) return { locked: false };

  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingMs = record.lockedUntil - now;
    return {
      locked: true,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      remainingMinutes: Math.ceil(remainingMs / (60 * 1000)),
    };
  }

  // Lock expired
  if (record.lockedUntil && record.lockedUntil <= now) {
    record.lockedUntil = null;
    record.failedAttempts = [];
  }

  return { locked: false };
}

/**
 * Records a failed login attempt and locks account if threshold (10) reached
 */
export function recordFailedAttempt(email: string): {
  locked: boolean;
  attemptsCount: number;
  remainingAttempts: number;
  remainingSeconds?: number;
  remainingMinutes?: number;
} {
  const key = normalizeEmail(email);
  const now = Date.now();
  let record = lockoutStore.get(key);

  if (!record) {
    record = { failedAttempts: [], lockedUntil: null };
    lockoutStore.set(key, record);
  }

  // Filter out attempts older than sliding window
  record.failedAttempts = record.failedAttempts.filter(
    ts => now - ts < ATTEMPT_WINDOW_MS
  );

  record.failedAttempts.push(now);

  if (record.failedAttempts.length >= LOCKOUT_MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    return {
      locked: true,
      attemptsCount: record.failedAttempts.length,
      remainingAttempts: 0,
      remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
      remainingMinutes: Math.ceil(LOCKOUT_DURATION_MS / (60 * 1000)),
    };
  }

  return {
    locked: false,
    attemptsCount: record.failedAttempts.length,
    remainingAttempts: Math.max(0, LOCKOUT_MAX_ATTEMPTS - record.failedAttempts.length),
  };
}

/**
 * Clears failed attempts upon successful authentication
 */
export function clearFailedAttempts(email: string): void {
  const key = normalizeEmail(email);
  lockoutStore.delete(key);
}

/**
 * Clears entire lockout store (for testing)
 */
export function resetLockoutStore(): void {
  lockoutStore.clear();
}
