import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getSurveyById, submitSurvey } from '@/services/surveys';
import { SubmitSurveySchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'TECHNICIAN', 'INSTALLER'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const surveyId = parts[parts.indexOf('surveys') + 1];

    const survey = await getSurveyById(surveyId);
    return NextResponse.json({ survey });
  }
);

export const POST = createApiHandler(
  {
    bodySchema: SubmitSurveySchema,
    allowedRoles: ['DIRECTOR', 'SALES', 'TECHNICIAN', 'INSTALLER'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const surveyId = parts[parts.indexOf('surveys') + 1];

    const survey = await submitSurvey(surveyId, body as any, user?.id);
    return NextResponse.json({ survey, message: 'Survey submitted successfully' });
  }
);
