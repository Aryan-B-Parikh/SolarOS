import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { AppError, formatErrorResponse } from './errors';
import { logger } from './logger';
import { Role, requireRole } from './rbac';

export interface HandlerOptions<TBody = any, TQuery = any> {
  bodySchema?: ZodSchema<TBody>;
  querySchema?: ZodSchema<TQuery>;
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
}

/**
 * Clean Next.js App Router API Route Handler wrapper
 * 1. Generates / extracts requestId
 * 2. Parses & validates JSON body and query parameters via Zod
 * 3. Enforces RBAC permissions
 * 4. Catches all errors and maps to standard JSON response format
 * 5. Structured logging
 */
export function createApiHandler<TBody = any, TQuery = any>(
  options: HandlerOptions<TBody, TQuery>,
  fn: (ctx: HandlerContext<TBody, TQuery>) => Promise<NextResponse | Response | any>
) {
  return async function (req: NextRequest): Promise<NextResponse> {
    const requestId = req.headers.get('x-request-id') || `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const startTime = Date.now();

    try {
      // 1. RBAC / Session check if not explicitly public
      let user: AuthenticatedUser | undefined;
      if (!options.public) {
        // Auth header / session verification
        const authHeader = req.headers.get('authorization');
        const roleHeader = req.headers.get('x-user-role') as Role;
        const userIdHeader = req.headers.get('x-user-id');

        if (roleHeader && userIdHeader) {
          user = {
            id: userIdHeader,
            name: req.headers.get('x-user-name') || 'User',
            email: req.headers.get('x-user-email') || '',
            role: roleHeader,
          };
        }

        if (options.allowedRoles && options.allowedRoles.length > 0) {
          if (!user) {
            throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
          }
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

