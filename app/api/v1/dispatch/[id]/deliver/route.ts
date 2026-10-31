import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { deliverDispatch } from '@/services/dispatch';
import { DeliverDispatchSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: DeliverDispatchSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchId = parts[parts.indexOf('dispatch') + 1];

    const result = await deliverDispatch({
      dispatchId,
      actorId: user?.id,
      deliveredAt: body?.deliveredAt,
      deliveredLat: body?.deliveredLat,
      deliveredLng: body?.deliveredLng,
    });

    return NextResponse.json(result);
  }
);

