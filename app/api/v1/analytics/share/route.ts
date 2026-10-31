import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { CreateShareLinkSchema } from '@/contracts';
import { createDashboardShareToken } from '@/services/analytics';

export const POST = createApiHandler(
  {
    bodySchema: CreateShareLinkSchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ body }) => {
    const result = createDashboardShareToken(body.period, body.durationHours);
    return NextResponse.json(result, { status: 201 });
  }
);

