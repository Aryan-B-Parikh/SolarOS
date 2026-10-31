import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { loadNonSerializedLine } from '@/services/dispatch';

const LoadNonSerializedSchema = z.object({
  lineId: z.string().uuid('Valid dispatch line UUID required'),
  qty: z.number().positive('Load quantity must be greater than zero'),
});

/**
 * Loads a bulk (non-serialized) quantity onto a dispatch line (FR-5.5).
 * Serial scans alone can never complete full-system orders because cable,
 * structure and ACDB/DCDB lines are non-serialized.
 */
export const POST = createApiHandler(
  {
    bodySchema: LoadNonSerializedSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchId = parts[parts.indexOf('dispatch') + 1];

    const result = await loadNonSerializedLine({
      dispatchId,
      lineId: body.lineId,
      qty: body.qty,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);
