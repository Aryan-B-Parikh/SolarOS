import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { ReplaceTicketPartSchema } from '@/contracts';
import { replaceTicketPart } from '@/services/tickets';

export const POST = createApiHandler(
  {
    bodySchema: ReplaceTicketPartSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const result = await replaceTicketPart(ticketId, body, user?.id);
    return NextResponse.json(result);
  }
);

