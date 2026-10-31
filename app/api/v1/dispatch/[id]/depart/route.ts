import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { departDispatch } from '@/services/dispatch';
import { DepartDispatchSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: DepartDispatchSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchId = parts[parts.indexOf('dispatch') + 1];

    const result = await departDispatch({
      dispatchId,
      actorId: user?.id,
      departedAt: body?.departedAt,
    });

    return NextResponse.json(result);
  }
);

