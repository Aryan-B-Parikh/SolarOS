import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getDashboardAlerts } from '@/services/analytics';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES', 'SUPPORT'],
  },
  async () => {
    const alerts = await getDashboardAlerts();
    return NextResponse.json(alerts);
  }
);

