import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getSurveyById, submitSurvey, updateSurveyDraft } from '@/services/surveys';
import { SubmitSurveySchema } from '@/contracts';
import { z } from 'zod';

const UpdateSurveyDraftSchema = z.object({
  roofType: z.enum(['RCC_FLAT', 'TIN_SHED', 'TILED', 'OTHER']).optional(),
  azimuthDeg: z.number().min(0).max(359).optional(),
  tiltDeg: z.number().min(0).max(90).optional(),
  usableAreaSqm: z.number().positive().optional(),
  shading: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
  cableDistanceM: z.number().positive().optional(),
  structureHeightM: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'TECHNICIAN', 'INSTALLER', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const surveyId = parts[parts.indexOf('surveys') + 1];

    const survey = await getSurveyById(surveyId);
    return NextResponse.json({ survey });
  }
);

export const PUT = createApiHandler(
  {
    bodySchema: UpdateSurveyDraftSchema,
    allowedRoles: ['DIRECTOR', 'TECHNICIAN', 'INSTALLER'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const surveyId = parts[parts.indexOf('surveys') + 1];

    const survey = await updateSurveyDraft(surveyId, body as any, user?.id);
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
