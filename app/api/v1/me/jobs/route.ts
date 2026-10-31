import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import prisma from '@/lib/db';
import { getISTDayRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['TECHNICIAN', 'DIRECTOR'],
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const allParam = url.searchParams.get('all') === 'true';

    const userId = user?.id;

    const where: any = {};

    if (user?.role === 'TECHNICIAN') {
      where.OR = [
        { crew_lead_id: userId },
        { crew: { some: { user_id: userId } } },
      ];
    }

    if (!allParam && dateParam) {
      const targetDate = new Date(dateParam);
      const { start, end } = getISTDayRange(targetDate);
      where.scheduled_on = { gte: start, lte: end };
    }

    const installations = await prisma.installation.findMany({
      where,
      include: {
        order: {
          include: {
            customer: true,
          },
        },
        crew_lead: {
          select: { id: true, name: true, phone: true },
        },
        crew: {
          include: {
            technician: {
              include: {
                user: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduled_on: 'asc' },
    });

    return NextResponse.json({
      jobs: installations.map((inst) => ({
        id: inst.id,
        orderId: inst.order_id,
        orderNumber: inst.order.order_number,
        customerName: inst.order.customer.name,
        customerPhone: inst.order.customer.phone,
        address: inst.order.customer.address,
        city: inst.order.customer.city,
        pincode: inst.order.customer.pincode,
        status: inst.status,
        scheduledOn: inst.scheduled_on.toISOString(),
        capacityKw: inst.installed_capacity_kw || inst.order.capacity_kw,
        systemType: inst.order.system_type,
        isCrewLead: inst.crew_lead_id === userId,
        crewLead: inst.crew_lead,
        crewCount: inst.crew.length + (inst.crew_lead_id ? 1 : 0),
        checklist: inst.checklist,
      })),
      total: installations.length,
    });
  }
);

