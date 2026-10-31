import { NextRequest, NextResponse } from 'next/server';
import { z, ZodType, ZodError } from 'zod';
import { AppError, formatErrorResponse } from './errors';
import { logger } from './logger';
import { Role, requireRole } from './rbac';
import { extractToken, verifyJwt } from './jwt';
import { validateSession } from './auth';

// Ensure BigInt values can be serialized by NextResponse.json / JSON.stringify
if (typeof BigInt.prototype !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

export const SESSION_COOKIE = 'solaros_session';
export const SESSION_COOKIE_NAME = 'sunpower_session';

export interface HandlerOptions<TBody = any, TQuery = any> {
  bodySchema?: z.ZodType<any, any, any>;
  querySchema?: z.ZodType<any, any, any>;
  allowedRoles?: Role[];
  public?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface HandlerContext<TBody = any, TQuery = any> {
  req: NextRequest;
  body: TBody;
  query: TQuery;
  user?: AuthenticatedUser;
  requestId: string;
  /** Dynamic route params, e.g. `{ id }` for app/api/v1/tickets/[id]/route.ts */
  params: Record<string, string>;
}

/**
 * Extracts session or bearer token from cookie or Authorization header.
 */
function extractSessionToken(req: NextRequest): string | null {
  const cookieToken =
    req.cookies.get(SESSION_COOKIE)?.value ||
    req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }
  return null;
}

/**
 * Clean Next.js App Router API Route Handler wrapper
 * 1. Generates / extracts requestId
 * 2. Authenticates staff via DB-backed session or Edge JWT
 * 3. Enforces RBAC permissions
 * 4. Parses & validates JSON body and query parameters via Zod
 * 5. Passes params to handler function
 * 6. Catches all errors and maps to standard JSON response format
 * 7. Structured logging
 */
export function createApiHandler<TBody = any, TQuery = any>(
  options: HandlerOptions<TBody, TQuery>,
  fn: (ctx: HandlerContext<TBody, TQuery>) => Promise<NextResponse | Response | any>
) {
  return async function (
    req: NextRequest,
    routeCtx?: { params?: Promise<Record<string, string>> | Record<string, string> }
  ): Promise<NextResponse> {
    const requestId =
      req.headers.get('x-request-id') ||
      `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const startTime = Date.now();

    // Dynamic route params (Next 14: plain object, Next 15: promise)
    let params: Record<string, string> = {};
    if (routeCtx?.params) {
      params =
        routeCtx.params instanceof Promise ? await routeCtx.params : { ...routeCtx.params };
    }

    try {
      // 1. RBAC / Session check if not explicitly public
      let user: AuthenticatedUser | undefined;
      if (!options.public) {
        // A. Check trusted internal headers set by Edge middleware (if present)
        const roleHeader = req.headers.get('x-user-role') as Role;
        const userIdHeader = req.headers.get('x-user-id');

        if (roleHeader && userIdHeader) {
          user = {
            id: userIdHeader,
            name: req.headers.get('x-user-name') || 'User',
            email: req.headers.get('x-user-email') || '',
            role: roleHeader,
          };
        } else {
          // B. Extract token from cookie or Authorization header
          const token = extractSessionToken(req);
          if (token) {
            // First check if token is signed JWT
            if (token.includes('.')) {
              const payload = verifyJwt(token);
              if (payload) {
                user = {
                  id: payload.userId,
                  name: payload.name,
                  email: payload.email,
                  role: payload.role,
                };
              }
            }

            // If not verified as JWT or needs DB validation, check DB session
            if (!user) {
              try {
                const session = await validateSession(token);
                if (session) {
                  user = {
                    id: session.user.id,
                    name: session.user.name,
                    email: session.user.email,
                    role: session.user.role as Role,
                  };
                }
              } catch (err) {
                logger.warn('Session validation failed', { requestId, error: String(err) });
              }
            }
          }
        }

        // Non-public routes require authentication
        if (!user) {
          throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
        }

        if (options.allowedRoles && options.allowedRoles.length > 0) {
          requireRole(user.role, options.allowedRoles);
        }
      }

      // 2. Query parsing & validation
      let query: any = {};
      if (options.querySchema) {
        const url = new URL(req.url);
        const searchParamsObj = Object.fromEntries(url.searchParams.entries());
        const parseResult = options.querySchema.safeParse(searchParamsObj);
        if (!parseResult.success) {
          throw new AppError('VALIDATION_FAILED', 'Invalid query parameters', 400, parseResult.error.format());
        }
        query = parseResult.data;
      }

      // 3. Body parsing & validation
      let body: any = {};
      if (options.bodySchema && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          const rawBody = await req.json();
          const parseResult = options.bodySchema.safeParse(rawBody);
          if (!parseResult.success) {
            throw new AppError('VALIDATION_FAILED', 'Invalid request payload', 400, parseResult.error.format());
          }
          body = parseResult.data;
        } catch (e) {
          if (e instanceof AppError) throw e;
          if (e instanceof ZodError) throw e;
          throw new AppError('VALIDATION_FAILED', 'Malformed JSON payload', 400);
        }
      }

      // 4. Execute Service function
      const result = await fn({
        req,
        body,
        query,
        user,
        requestId,
        params,
      });

      const durationMs = Date.now() - startTime;
      logger.info(`${req.method} ${req.nextUrl.pathname} completed in ${durationMs}ms`, {
        requestId,
        userId: user?.id,
        role: user?.role,
        durationMs,
      });

      if (result instanceof Response) {
        return result as NextResponse;
      }

      return NextResponse.json(result, {
        headers: { 'x-request-id': requestId },
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      logger.error(`${req.method} ${req.nextUrl.pathname} failed in ${durationMs}ms`, err, {
        requestId,
      });

      const { status, body } = formatErrorResponse(err, requestId);
      return NextResponse.json(body, {
        status,
        headers: { 'x-request-id': requestId },
      });
    }
  };
}
