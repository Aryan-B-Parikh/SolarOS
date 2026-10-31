import crypto from 'crypto';
import { prisma } from './db.ts';
import { getRoleDefaultRoute, type Role } from './rbac.ts';
import {
  signJwt,
  verifyJwt,
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  generateSessionCookie,
  generateClearSessionCookie,
  SESSION_COOKIE_NAME,
  extractToken,
  type JwtPayload,
} from './jwt.ts';

export {
  signJwt,
  verifyJwt,
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  generateSessionCookie,
  generateClearSessionCookie,
  SESSION_COOKIE_NAME,
  extractToken,
};


/**
 * Hash password with Argon2id or cryptographically secure scrypt fallback
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const pkg = '@node-rs/argon2';
    const argon2 = await import(/* webpackIgnore: true */ pkg).catch(() => null);
    if (argon2?.hash) return await argon2.hash(password);
  } catch {
    // Scrypt fallback if native module isn't loaded
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('scrypt:')) {
    const [, salt, originalKey] = hash.split(':');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derivedKey), Buffer.from(originalKey));
  }
  try {
    const pkg = '@node-rs/argon2';
    const argon2 = await import(/* webpackIgnore: true */ pkg).catch(() => null);
    if (argon2?.verify) return await argon2.verify(hash, password);
    return false;
  } catch {
    return false;
  }
}

/**
 * Creates a database session for staff
 * Staff sessions expire after 12 idle hours (field devices after 30 days)
 */
export async function createSession(userId: string, isFieldDevice: boolean = false) {
  const durationHours = isFieldDevice ? 30 * 24 : 12;
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  const token = crypto.randomBytes(32).toString('hex');

  const session = await prisma.session.create({
    data: {
      user_id: userId,
      token,
      expires_at: expiresAt,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          is_active: true,
        },
      },
    },
  });

  return session;
}

/**
 * Validates a session token
 */
export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          is_active: true,
        },
      },
    },
  });

  if (!session || !session.user.is_active || new Date(session.expires_at) <= new Date()) {
    return null;
  }

  return session;
}

export interface AuthSuccessResult {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  token: string;
  cookieHeader: string;
  redirectTo: string;
}

/**
 * Full authentication workflow:
 * Validates credentials, checks account lockout (10 failed tries = 15m lock),
 * creates DB session, issues signed HS256 JWT, sets cookie, updates last_login_at.
 */
export async function authenticateUser(
  email: string,
  password: string,
  isFieldDevice: boolean = false
): Promise<AuthSuccessResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check account lockout
  const lockStatus = checkAccountLockout(normalizedEmail);
  if (lockStatus.locked) {
    const error: any = new Error(
      `Account is temporarily locked due to 10 failed login attempts. Please try again in ${lockStatus.remainingMinutes} minute(s).`
    );
    error.code = 'ACCOUNT_LOCKED';
    error.statusCode = 423;
    error.remainingMinutes = lockStatus.remainingMinutes;
    throw error;
  }

  // 2. Query user from database
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      password_hash: true,
      role: true,
      is_active: true,
    },
  });

  if (!user) {
    const failure = recordFailedAttempt(normalizedEmail);
    if (failure.locked) {
      const error: any = new Error(
        'Account has been temporarily locked for 15 minutes following 10 failed login attempts.'
      );
      error.code = 'ACCOUNT_LOCKED';
      error.statusCode = 423;
      throw error;
    }
    const error: any = new Error('Invalid email or password.');
    error.code = 'INVALID_CREDENTIALS';
    error.statusCode = 401;
    throw error;
  }

  // 3. Check active state
  if (!user.is_active) {
    const error: any = new Error('Your staff account has been deactivated. Please contact your administrator.');
    error.code = 'ACCOUNT_DISABLED';
    error.statusCode = 403;
    throw error;
  }

  // 4. Verify password
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    const failure = recordFailedAttempt(normalizedEmail);
    if (failure.locked) {
      const error: any = new Error(
        'Account has been temporarily locked for 15 minutes following 10 failed login attempts.'
      );
      error.code = 'ACCOUNT_LOCKED';
      error.statusCode = 423;
      throw error;
    }
    const error: any = new Error('Invalid email or password.');
    error.code = 'INVALID_CREDENTIALS';
    error.statusCode = 401;
    throw error;
  }

  // 5. Successful authentication: clear failure count
  clearFailedAttempts(normalizedEmail);

  // 6. Create database session (Spec 2.6)
  const session = await createSession(user.id, isFieldDevice);

  // 7. Update last_login_at timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  }).catch(() => {}); // non-blocking

  // 8. Sign JWT token
  const token = signJwt({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    isFieldDevice,
    sessionId: session.id,
  });

  // 9. Generate Set-Cookie header
  const cookieHeader = generateSessionCookie(token, isFieldDevice);

  // 10. Default landing route for role
  const redirectTo = getRoleDefaultRoute(user.role as Role);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
    },
    token,
    cookieHeader,
    redirectTo,
  };
}


