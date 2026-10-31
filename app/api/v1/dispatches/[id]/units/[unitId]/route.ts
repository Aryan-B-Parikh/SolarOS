import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { unscanDispatchUnit } from '@/services/dispatch';

export const DELETE = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchIdx = parts.indexOf('dispatches');
    const dispatchId = parts[dispatchIdx + 1];
    const unitIdx = parts.indexOf('units');
    const unitId = parts[unitIdx + 1];

    const result = await unscanDispatchUnit({
      dispatchId,
      unitId,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

