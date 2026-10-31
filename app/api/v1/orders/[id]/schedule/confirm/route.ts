import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { confirmOrderSchedule } from '@/services/scheduling';
import { z } from 'zod';

const ConfirmScheduleSchema = z.object({
  crewLeadId: z.string(),
  memberIds: z.array(z.string()).optional(),
  scheduledDate: z.string(),
});

export const POST = createApiHandler(
  {
    bodySchema: ConfirmScheduleSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const orderId = parts[parts.indexOf('orders') + 1];

    const installation = await confirmOrderSchedule(orderId, body, user?.id);
    return NextResponse.json({ installation });
  }
);

