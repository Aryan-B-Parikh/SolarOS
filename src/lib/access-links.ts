/**
 * SunPower Ops - Customer Access Link & Security Service
 * Specification Reference: TRD 2.6, PRD 1.8, D11, Backend Schema 5.3 & 5.4
 *
 * Rules:
 * 1. Quote, certificate and portal links use 128-bit cryptographically random tokens.
 * 2. Only a SHA-256 hash is stored in the database (token_hash).
 * 3. Expirations:
 *    - Portal links: 90 days
 *    - Certificate links: 90 days
 *    - Quote links: Quote validity + 30 days
 * 4. Tokens are revocable at any time (revoked_at).
 * 5. Sensitive actions require extra verification:
 *    - Accepting/rejecting quote, raising/confirming tickets, viewing invoices/payments
 *    - Challenge: Last four digits of the registered customer phone number.
 *    - Five wrong tries lock the link for 15 minutes (failed_attempts, locked_until).
 *    - Successful challenge grants a 30-minute verified session cookie.
 * 6. Tokens must never be logged or exposed in raw form in database rows.
 */

import crypto from 'node:crypto';

export type LinkScope = 'PORTAL' | 'QUOTE' | 'CERTIFICATE';

export type LinkStatus = 'VALID' | 'EXPIRED' | 'REVOKED' | 'LOCKED';

export interface GeneratedTokenResult {
  rawToken: string;
  tokenHash: string;
  scope: LinkScope;
  expiresAt: Date;
}

export interface LinkRecord {
  id?: string;
  customerId: string;
  scope: LinkScope;
  tokenHash: string;
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
  lastUsedAt?: Date | string | null;
  failedAttempts: number;
  lockedUntil?: Date | string | null;
}

export interface ChallengeVerificationResult {
  success: boolean;
  linkStatus: LinkStatus;
  failedAttempts: number;
  lockedUntil: Date | null;
  lockRemainingMinutes?: number;
  sessionToken?: string;
  sessionExpiresAt?: Date;
  errorMessage?: string;
}

const DEFAULT_SECRET = process.env.ACCESS_LINK_SECRET || 'sunpower-default-dev-secret-key-32chars!!';

/**
 * Generates a 128-bit cryptographically random token (16 bytes = 32 hex chars)
 * and its corresponding SHA-256 hash.
 */
export function generateAccessToken(
  scope: LinkScope,
  quoteValidityDays: number = 15
): GeneratedTokenResult {
  const rawBytes = crypto.randomBytes(16); // 128-bit
  const rawToken = rawBytes.toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresAt = calculateExpiry(scope, quoteValidityDays);

  return {
    rawToken,
    tokenHash,
    scope,
    expiresAt,
  };
}

/**
 * Computes the SHA-256 hash hex string of a raw token.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Calculates expiration timestamp per scope.
 */
export function calculateExpiry(scope: LinkScope, quoteValidityDays: number = 15): Date {
  const now = new Date();
  const date = new Date(now.getTime());

  if (scope === 'PORTAL' || scope === 'CERTIFICATE') {
    // 90 days expiration
    date.setDate(date.getDate() + 90);
  } else if (scope === 'QUOTE') {
    // Quote validity plus 30 days
    date.setDate(date.getDate() + (quoteValidityDays + 30));
  }

  return date;
}

/**
 * Checks if a date has passed.
 */
export function isExpired(expiresAt: Date | string): boolean {
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return exp.getTime() <= Date.now();
}

/**
 * Checks if a link has been revoked.
 */
export function isRevoked(revokedAt?: Date | string | null): boolean {
  if (!revokedAt) return false;
  const rev = typeof revokedAt === 'string' ? new Date(revokedAt) : revokedAt;
  return rev.getTime() <= Date.now();
}

/**
 * Checks if a link is currently in a temporary lock period.
 */
export function isLocked(lockedUntil?: Date | string | null): boolean {
  if (!lockedUntil) return false;
  const lock = typeof lockedUntil === 'string' ? new Date(lockedUntil) : lockedUntil;
  return lock.getTime() > Date.now();
}

/**
 * Evaluates the full operational status of an access link.
 */
export function evaluateLinkStatus(link: LinkRecord): LinkStatus {
  if (isRevoked(link.revokedAt)) {
    return 'REVOKED';
  }
  if (isLocked(link.lockedUntil)) {
    return 'LOCKED';
  }
  if (isExpired(link.expiresAt)) {
    return 'EXPIRED';
  }
  return 'VALID';
}

/**
 * Normalizes a phone number and extracts its last 4 digits.
 * E.164 examples: +91 90000 00021 -> 0021
 */
export function extractLastFourDigits(phoneNumber: string): string {
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    throw new Error('Phone number must contain at least 4 digits');
  }
  return digitsOnly.slice(-4);
}

/**
 * Verifies the customer's phone last-4-digits challenge.
 * Enforces rate limiting: 5 consecutive failures lock the link for 15 minutes.
 */
export function verifyPhoneChallenge(
  link: LinkRecord,
  customerRegisteredPhone: string,
  providedLastFour: string,
  secretKey: string = DEFAULT_SECRET
): ChallengeVerificationResult {
  const currentStatus = evaluateLinkStatus(link);

  if (currentStatus === 'REVOKED') {
    return {
      success: false,
      linkStatus: 'REVOKED',
      failedAttempts: link.failedAttempts,
      lockedUntil: null,
      errorMessage: 'This access link has been revoked by SunPower support.',
    };
  }

  if (currentStatus === 'EXPIRED') {
    return {
      success: false,
      linkStatus: 'EXPIRED',
      failedAttempts: link.failedAttempts,
      lockedUntil: null,
      errorMessage: 'This access link has expired. Please request a fresh link.',
    };
  }

  if (currentStatus === 'LOCKED') {
    const lockDate = typeof link.lockedUntil === 'string' ? new Date(link.lockedUntil) : link.lockedUntil!;
    const remainingMs = lockDate.getTime() - Date.now();
    const remainingMins = Math.ceil(remainingMs / (60 * 1000));
    return {
      success: false,
      linkStatus: 'LOCKED',
      failedAttempts: link.failedAttempts,
      lockedUntil: lockDate,
      lockRemainingMinutes: remainingMins,
      errorMessage: `Too many failed attempts. Link is locked for ${remainingMins} more minute(s).`,
    };
  }

  const expectedDigits = extractLastFourDigits(customerRegisteredPhone);
  const cleanInput = providedLastFour.replace(/\D/g, '');

  if (cleanInput === expectedDigits) {
    // Challenge success! Issue 30-minute verified session cookie token
    const sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    const sessionToken = createVerifiedSessionToken(link.tokenHash, link.customerId, sessionExpiresAt, secretKey);

    return {
      success: true,
      linkStatus: 'VALID',
      failedAttempts: 0,
      lockedUntil: null,
      sessionToken,
      sessionExpiresAt,
    };
  } else {
    // Challenge failure
    const newFailures = link.failedAttempts + 1;
    let lockedUntil: Date | null = null;
    let newStatus: LinkStatus = 'VALID';
    let errorMsg = 'Incorrect phone verification digits.';

    if (newFailures >= 5) {
      // 5 wrong attempts lock for 15 minutes
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      newStatus = 'LOCKED';
      errorMsg = 'Incorrect phone verification digits. 5 failed attempts reached; link locked for 15 minutes.';
    }

    return {
      success: false,
      linkStatus: newStatus,
      failedAttempts: newFailures,
      lockedUntil,
      lockRemainingMinutes: lockedUntil ? 15 : undefined,
      errorMessage: errorMsg,
    };
  }
}

/**
 * Creates an HMAC-signed session token for the verified 30-minute state.
 */
export function createVerifiedSessionToken(
  tokenHash: string,
  customerId: string,
  expiresAt: Date,
  secretKey: string = DEFAULT_SECRET
): string {
  const payload = JSON.stringify({
    th: tokenHash,
    cid: customerId,
    exp: expiresAt.getTime(),
  });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', secretKey).update(base64Payload).digest('base64url');
  return `${base64Payload}.${signature}`;
}

/**
 * Validates a verified session token for sensitive actions.
 */
export function validateVerifiedSessionToken(
  sessionToken: string,
  expectedTokenHash: string,
  expectedCustomerId: string,
  secretKey: string = DEFAULT_SECRET
): boolean {
  try {
    const parts = sessionToken.split('.');
    if (parts.length !== 2) return false;
    const [base64Payload, signature] = parts;

    const expectedSig = crypto.createHmac('sha256', secretKey).update(base64Payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    if (payload.th !== expectedTokenHash || payload.cid !== expectedCustomerId) {
      return false;
    }
    if (payload.exp <= Date.now()) {
      return false; // Expired 30-minute session
    }

    return true;
  } catch {
    return false;
  }
}
