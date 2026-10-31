import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { ConfirmTicketSchema } from '@/contracts';
import { confirmTicketResolution } from '@/services/tickets';

export const POST = createApiHandler(
  {
    bodySchema: ConfirmTicketSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const result = await confirmTicketResolution(
      ticketId,
      {
        confirmationMethod: body?.confirmationMethod || 'PHONE',
        customerFeedback: body?.customerFeedback,
      },
      user?.id
    );

    return NextResponse.json(result);
  }
);

