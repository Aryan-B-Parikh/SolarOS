import { cookies } from 'next/headers';
import { validateSession } from './auth';
import { SESSION_COOKIE, SESSION_COOKIE_NAME } from './handler';
import { verifyJwt } from './jwt';
import type { Role } from './rbac';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

/**
 * Reads the current staff session from the HttpOnly cookie inside a
 * server component / route handler. Returns null when not signed in.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token =
    cookieStore.get(SESSION_COOKIE)?.value ||
    cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  // 1. If it's a signed JWT, verify payload
  if (token.includes('.')) {
    const payload = verifyJwt(token);
    if (payload) {
      return {
        id: payload.userId,
        name: payload.name,
        email: payload.email,
        role: payload.role as Role,
        is_active: true,
      };
    }
  }

  // 2. Otherwise, check DB session
  try {
    const session = await validateSession(token);
    if (!session) return null;
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as Role,
      is_active: session.user.is_active,
    };
  } catch {
    return null;
  }
}
