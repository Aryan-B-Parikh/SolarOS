import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { ReopenTicketSchema } from '@/contracts';
import { reopenTicket } from '@/services/tickets';

export const POST = createApiHandler(
  {
    bodySchema: ReopenTicketSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const result = await reopenTicket(ticketId, body, user?.id);
    return NextResponse.json(result);
  }
);

