import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getPendingSteps } from '@/services/analytics';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES', 'SUPPORT'],
  },
  async () => {
    const pending = await getPendingSteps();
    return NextResponse.json(pending);
  }
);

