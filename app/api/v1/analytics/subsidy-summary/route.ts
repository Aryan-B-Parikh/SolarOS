import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getSubsidySummary } from '@/services/analytics';
import { z } from 'zod';

const SubsidySummaryQuerySchema = z.object({
  status: z
    .enum(['NOT_STARTED', 'SUBMITTED', 'UNDER_INSPECTION', 'APPROVED', 'DISBURSED', 'REJECTED'])
    .optional(),
});

/**
 * GET /api/v1/analytics/subsidy-summary (FR-4.8 / C11)
 * Real subsidy applications with order/customer/status/amounts.
 */
export const GET = createApiHandler(
  {
    querySchema: SubsidySummaryQuerySchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ query }) => {
    const items = await getSubsidySummary(query?.status);
    return NextResponse.json({ subsidies: items });
  }
);
