import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { ConvertAlertSchema } from '@/contracts';
import { convertAlertToTicket } from '@/services/maintenance';

export const POST = createApiHandler(
  {
    bodySchema: ConvertAlertSchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'TECHNICIAN'],
  },
  async ({ params, body, user }) => {
    const { id } = await params;
    const ticket = await convertAlertToTicket(id, body, user?.id);
    return NextResponse.json(ticket, { status: 201 });
  }
);

