import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getTopProfitJobs } from '@/services/analytics';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async () => {
    const topJobs = await getTopProfitJobs(5);
    return NextResponse.json({ topJobs });
  }
);

