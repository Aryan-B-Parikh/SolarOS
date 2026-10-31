import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { scheduleSurvey } from '@/services/surveys';
import { z } from 'zod';

const ScheduleSurveySchema = z.object({
  surveyorId: z.string().uuid().optional(),
  scheduledAt: z.string(),
});

export const POST = createApiHandler(
  {
    bodySchema: ScheduleSurveySchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const leadId = parts[parts.indexOf('leads') + 1];

    const survey = await scheduleSurvey(leadId, body, user?.id);
    return NextResponse.json({ survey }, { status: 201 });
  }
);
