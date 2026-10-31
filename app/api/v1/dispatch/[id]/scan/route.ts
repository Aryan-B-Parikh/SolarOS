import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { scanDispatchUnit } from '@/services/dispatch';
import { ScanDispatchUnitSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: ScanDispatchUnitSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const dispatchId = parts[parts.indexOf('dispatch') + 1];

    const result = await scanDispatchUnit({
      dispatchId,
      unitCode: body.unitCode,
      method: body.method,
      scannedBy: user?.id,
    });

    return NextResponse.json(result);
  }
);

