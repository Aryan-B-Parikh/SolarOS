import { createApiHandler } from '@/lib/handler';
import { runSurveyPhotoAnalysis } from '@/services/assessments';
import { z } from 'zod';

const PhotoAnalysisSchema = z.object({
  photoUrls: z.array(z.string().url()).optional().default([]),
});

export const POST = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES'],
    bodySchema: PhotoAnalysisSchema,
  },
  async ({ body, user, req }) => {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const surveyId = segments[segments.indexOf('surveys') + 1];

    const findings = await runSurveyPhotoAnalysis(
      surveyId,
      body.photoUrls,
      undefined,
      user?.id
    );

    return {
      success: true,
      findings,
    };
  }
);

