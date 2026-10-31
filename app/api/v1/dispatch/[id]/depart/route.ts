import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { departDispatch } from '@/services/dispatch';
import { DepartDispatchSchema } from '@/contracts';

const DepartBodySchema = DepartDispatchSchema.extend({
  idempotencyKey: z.string().min(6).max(128).optional(),
});

/**
 * Departure gate + stock consumption (FR-5.5 / FR-4.5 / X-QUAL-IDEM).
 * An `x-idempotency-key` header (or `idempotencyKey` body field) scoped to
 * `dispatch:depart:<id>` makes retried requests safe: the replay returns the
 * already-departed state instead of double-decrementing stock.
 */
export const POST = createApiHandler(
  {
    bodySchema: DepartBodySchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchId = parts[parts.indexOf('dispatch') + 1];

    const idempotencyKey =
      req.headers.get('x-idempotency-key') || body?.idempotencyKey || undefined;

    const result = await departDispatch({
      dispatchId,
      actorId: user?.id,
      departedAt: body?.departedAt,
      idempotencyKey,
    });

    return NextResponse.json(result);
  }
);
