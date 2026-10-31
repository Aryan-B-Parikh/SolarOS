import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { unscanDispatchUnit } from '@/services/dispatch';
import { UnscanDispatchUnitSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: UnscanDispatchUnitSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchId = parts[parts.indexOf('dispatch') + 1];

    const result = await unscanDispatchUnit({
      dispatchId,
      unitId: body.unitId,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

