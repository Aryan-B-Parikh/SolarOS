import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { loadNonSerializedLine } from '@/services/dispatch';

const LoadSchema = z.object({
  qty: z.number().positive(),
});

export const POST = createApiHandler(
  {
    bodySchema: LoadSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchIdx = parts.indexOf('dispatches');
    const dispatchId = parts[dispatchIdx + 1];
    const lineIdx = parts.indexOf('lines');
    const lineId = parts[lineIdx + 1];

    const result = await loadNonSerializedLine({
      dispatchId,
      lineId,
      qty: body.qty,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

