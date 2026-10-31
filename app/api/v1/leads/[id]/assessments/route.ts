import { createApiHandler } from '@/lib/handler';
import { runLeadAssessment, getLeadAssessment } from '@/services/assessments';
import { z } from 'zod';

const RunAssessmentSchema = z.object({
  monthlyBillRs: z.number().positive().optional(),
  monthlyUnitsKwh: z.number().positive().optional(),
  tariffRsPerKwh: z.number().positive().optional(),
  usableRoofAreaM2: z.number().positive().optional(),
  shadingLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
  sanctionedLoadKw: z.number().positive().optional(),
  quoteTotalRs: z.number().positive().optional(),
  subsidyEstimateRs: z.number().nonnegative().optional(),
});

export const POST = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES'],
    bodySchema: RunAssessmentSchema,
  },
  async ({ body, user, req }) => {
    // Extract lead ID from URL pathname
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const leadId = segments[segments.indexOf('leads') + 1];

    const result = await runLeadAssessment(leadId, body, user?.id);
    return result;
  }
);

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const leadId = segments[segments.indexOf('leads') + 1];

    const assessment = await getLeadAssessment(leadId);
    return assessment;
  }
);

