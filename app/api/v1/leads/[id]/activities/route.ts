import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { addLeadActivity } from '@/services/leads';
import { LeadActivityType } from '@prisma/client';
import { z } from 'zod';

const AddActivitySchema = z.object({
  type: z.enum(['CALL', 'NOTE', 'SURVEY_BOOKED', 'QUOTE_SENT']).default('CALL'),
  body: z.string().min(1, 'Activity note body is required'),
});

export const POST = createApiHandler(
  {
    bodySchema: AddActivitySchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const id = url.pathname.split('/')[4]; // /api/v1/leads/[id]/activities

    const activity = await addLeadActivity(id, body.type as LeadActivityType, body.body, user?.id);
    return NextResponse.json({ activity }, { status: 201 });
  }
);

