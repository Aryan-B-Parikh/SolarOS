import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import prisma from '@/lib/db';
import { suggestCrewsForOrder } from '@/services/scheduling';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'SALES', 'TECHNICIAN'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];
    const dateParam = url.searchParams.get('date') || undefined;

    let orderId = installationId;
    const inst = await prisma.installation.findUnique({
      where: { id: installationId },
      select: { order_id: true },
    });
    if (inst) {
      orderId = inst.order_id;
    }

    const result = await suggestCrewsForOrder(orderId, dateParam);
    return NextResponse.json(result);
  }
);

