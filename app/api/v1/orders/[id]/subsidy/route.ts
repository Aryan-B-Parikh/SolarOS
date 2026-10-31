import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { updateSubsidyChecklist } from '@/services/orders';
import { z } from 'zod';

const UpdateSubsidySchema = z.object({
  status: z.enum(['NOT_STARTED', 'SUBMITTED', 'UNDER_INSPECTION', 'APPROVED', 'DISBURSED', 'REJECTED']),
  applicationNumber: z.string().optional(),
  inspectionDate: z.string().optional(),
  sanctionedAmountRupees: z.number().optional(),
  disbursedOn: z.string().optional(),
  notes: z.string().optional(),
});

export const PATCH = createApiHandler(
  {
    bodySchema: UpdateSubsidySchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const orderId = parts[parts.indexOf('orders') + 1];

    const subsidy = await updateSubsidyChecklist(orderId, body, user?.id);
    return NextResponse.json({ subsidy });
  }
);
