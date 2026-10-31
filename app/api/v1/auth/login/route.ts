import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { signJwt, SESSION_COOKIE_NAME } from '@/lib/jwt';
import { getRoleDefaultRoute, type Role } from '@/lib/rbac';
import { AppError, formatErrorResponse } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SESSION_COOKIE } from '@/lib/handler';

export const dynamic = 'force-dynamic';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid work email address'),
  password: z.string().min(1, 'Password is required'),
  isFieldDevice: z.boolean().optional().default(false),
});

// D13: lock account after 10 consecutive failures, for 30 minutes
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MINUTES = 30;

// In-memory IP rate limit: 15 login attempts per minute per IP
const attemptMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = attemptMap.get(ip);
  if (!record || now > record.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + 60000 });
    return false;
  }
  record.count += 1;
  return record.count > 15;
}

export async function POST(req: NextRequest) {
  const requestId = `login-${Date.now().toString(36)}`;
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    if (isRateLimited(ip)) {
      throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.', 429);
    }

    const raw = await req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Email and password are required', 400);
    }
    const email = parsed.data.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });

    // Uniform response: never reveal whether the account exists
    const invalid = new AppError('UNAUTHENTICATED', 'Invalid email or password', 401);

    if (!user || !user.is_active) {
      throw invalid;
    }

    // Locked out?
    if (user.locked_until && user.locked_until > new Date()) {
      const minutes = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
      throw new AppError(
        'ACCOUNT_LOCKED',
        `Account temporarily locked after repeated failed attempts. Try again in ${minutes} minute(s).`,
        423
      );
    }

    const ok = await verifyPassword(parsed.data.password, user.password_hash);
    if (!ok) {
      const failedCount = (user.failed_login_count || 0) + 1;
      const shouldLock = failedCount >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_count: shouldLock ? 0 : failedCount,
          ...(shouldLock
            ? { locked_until: new Date(Date.now() + LOCK_DURATION_MINUTES * 60000) }
            : {}),
        },
      });
      logger.warn('Login failed', { requestId, email, failedCount, locked: shouldLock });
      if (shouldLock) {
        throw new AppError(
          'ACCOUNT_LOCKED',
          `Too many failed attempts. Account locked for ${LOCK_DURATION_MINUTES} minutes.`,
          423
        );
      }
      throw invalid;
    }

    // Success: reset failure counters, create DB session
    await prisma.user.update({
      where: { id: user.id },
      data: { failed_login_count: 0, locked_until: null, last_login_at: new Date() },
    });

    const isFieldDevice = parsed.data.isFieldDevice || user.role === 'TECHNICIAN';
    const session = await createSession(user.id, isFieldDevice);

    const role = user.role as Role;
    const redirectTo = getRoleDefaultRoute(role);

    // Sign Edge-compatible JWT
    const jwtToken = signJwt({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      isFieldDevice,
      sessionId: session.id,
    });

    const maxAge = isFieldDevice ? 30 * 24 * 3600 : 12 * 3600;

    const res = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: jwtToken,
      redirectTo,
    });

    // Set HttpOnly cookies for both solaros_session and sunpower_session
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });

    res.cookies.set(SESSION_COOKIE_NAME, jwtToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });

    logger.info('Login success', { requestId, email, role: user.role });
    return res;
  } catch (err) {
    const { status, body } = formatErrorResponse(err, requestId);
    return NextResponse.json(body, { status });
  }
}
