import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { ResolveTicketSchema } from '@/contracts';
import { resolveTicket } from '@/services/tickets';

export const POST = createApiHandler(
  {
    bodySchema: ResolveTicketSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const result = await resolveTicket(ticketId, body, user?.id);
    return NextResponse.json(result);
  }
);

