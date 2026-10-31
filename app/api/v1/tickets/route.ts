import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { CreateTicketSchema } from '@/contracts';
import { createTicket } from '@/services/tickets';
import { prisma } from '@/lib/db';

export const POST = createApiHandler(
  {
    bodySchema: CreateTicketSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'SALES', 'TECHNICIAN'],
  },
  async ({ body, user }) => {
    const ticket = await createTicket(body, user?.id);
    return NextResponse.json(ticket, { status: 201 });
  }
);

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'SALES', 'TECHNICIAN', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const customerId = url.searchParams.get('customerId');

    const tickets = await prisma.serviceTicket.findMany({
      where: {
        status: status ? (status as any) : undefined,
        priority: priority ? (priority as any) : undefined,
        customer_id: customerId || undefined,
      },
      include: {
        customer: true,
        unit: { include: { product: true } },
        warranty: true,
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return NextResponse.json(tickets);
  }
);

