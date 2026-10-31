import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import prisma from '@/lib/db';
import { DispatchStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'TECHNICIAN'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') as DispatchStatus | undefined;
    const orderId = url.searchParams.get('orderId') || undefined;

    const where: any = {};
    if (status) where.status = status;
    if (orderId) where.order_id = orderId;

    const dispatches = await prisma.dispatch.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            order_number: true,
            customer: { select: { name: true, phone: true, address: true } },
          },
        },
        from_location: { select: { code: true, name: true } },
        vehicle_location: { select: { code: true, name: true } },
        lines: { include: { product: true } },
        units: { include: { unit: true } },
      },
      orderBy: { scheduled_on: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      dispatches: dispatches.map((d) => ({
        id: d.id,
        dispatchNumber: d.dispatch_number,
        orderId: d.order_id,
        orderNumber: d.order.order_number,
        customerName: d.order.customer.name,
        customerAddress: d.order.customer.address,
        status: d.status,
        scheduledOn: d.scheduled_on.toISOString(),
        fromLocation: d.from_location.name,
        vehicle: d.vehicle_location?.name || null,
        departedAt: d.departed_at?.toISOString() || null,
        deliveredAt: d.delivered_at?.toISOString() || null,
        linesCount: d.lines.length,
        scannedUnitsCount: d.units.length,
      })),
      total: dispatches.length,
    });
  }
);

