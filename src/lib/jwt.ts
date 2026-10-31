import crypto from 'crypto';
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
 * Base64url encoding and decoding utilities
 */
function base64UrlEncode(str: string | Buffer): string {
  const buf = Buffer.isBuffer(str) ? str : Buffer.from(str, 'utf8');
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
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
  const signature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('base64url');

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

    // 2. Verify signature with timingSafeEqual
    const dataToSign = `${headerB64}.${payloadB64}`;
    const expectedSignature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('base64url');

    const sigBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
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
