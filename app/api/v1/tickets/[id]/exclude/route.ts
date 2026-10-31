import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { ExcludeWarrantySchema } from '@/contracts';
import { excludeTicketWarranty } from '@/services/tickets';

export const POST = createApiHandler(
  {
    bodySchema: ExcludeWarrantySchema,
    allowedRoles: ['DIRECTOR'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const result = await excludeTicketWarranty(ticketId, body, user!.id);
    return NextResponse.json(result);
  }
);

