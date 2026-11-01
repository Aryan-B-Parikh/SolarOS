// Route wrapper: parse with Zod, authorise, map domain errors to the spec's
// error format (TRD 2.7). Route handlers stay thin (2.12).

import { NextRequest, NextResponse } from 'next/server'
import { ZodType } from 'zod'
import { AppError, errorBody } from '@/lib/errors'
import { randomUUID } from 'crypto'

export function requestId(): string {
  return randomUUID().slice(0, 8)
}

export async function handler<T>(
  req: NextRequest,
  fn: (ctx: { body: T; req: NextRequest; requestId: string }) => Promise<unknown>
): Promise<NextResponse> {
  const rid = requestId()
  try {
    let body = undefined as unknown as T
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      try {
        body = await req.json()
      } catch {
        body = {} as T
      }
    }
    const result = await fn({ body, req, requestId: rid })
    if (result instanceof NextResponse) return result
    return NextResponse.json(result ?? { ok: true })
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(errorBody(err, rid), { status: err.status })
    }
    console.error(`[api:${rid}]`, err)
    return NextResponse.json(errorBody(err, rid), { status: 500 })
  }
}

export async function handlerWithSchema<B, T>(
  req: NextRequest,
  schema: ZodType<B>,
  fn: (ctx: { body: B; req: NextRequest; requestId: string }) => Promise<unknown>
): Promise<NextResponse> {
  return handler(req, async (ctx) => {
    const parsed = schema.safeParse(ctx.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Please check the highlighted fields.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
    }
    return fn({ ...ctx, body: parsed.data })
  })
}

export function searchParams(req: NextRequest): URLSearchParams {
  return new URL(req.url).searchParams
}
