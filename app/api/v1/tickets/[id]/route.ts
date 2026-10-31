import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getTicket } from '@/services/tickets';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'SALES', 'TECHNICIAN', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const ticket = await getTicket(ticketId);
    return NextResponse.json(ticket);
  }
);

