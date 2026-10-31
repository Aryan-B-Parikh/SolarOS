import crypto from 'crypto';
import { prisma } from './db';
import { Role } from './rbac';

/**
 * Hash password with Argon2id or cryptographically secure scrypt fallback
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const argon2 = await import('@node-rs/argon2');
    return await argon2.hash(password);
  } catch {
    // Scrypt fallback if native module isn't loaded
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }
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
    const argon2 = await import('@node-rs/argon2');
    return await argon2.verify(hash, password);
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

