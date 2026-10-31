import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { AssignTicketSchema } from '@/contracts';
import { assignTicket } from '@/services/tickets';

export const POST = createApiHandler(
  {
    bodySchema: AssignTicketSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const updated = await assignTicket(ticketId, body.technicianId, body.scheduledDate, user?.id);
    return NextResponse.json(updated);
  }
);

