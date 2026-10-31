import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { submitSurvey } from '@/services/surveys';
import { SubmitSurveySchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: SubmitSurveySchema,
    allowedRoles: ['DIRECTOR', 'SALES', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const surveyId = parts[parts.indexOf('surveys') + 1];

    const survey = await submitSurvey(surveyId, body as any, user?.id);
    return NextResponse.json({ survey, message: 'Survey completed successfully' });
  }
);

