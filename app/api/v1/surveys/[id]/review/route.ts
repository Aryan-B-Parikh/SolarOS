import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { reviewSurvey } from '@/services/surveys';
import { ReviewSurveySchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: ReviewSurveySchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const surveyId = parts[parts.indexOf('surveys') + 1];

    const survey = await reviewSurvey(surveyId, body.action as any, body.reason, user?.id);
    return NextResponse.json({ survey });
  }
);

