import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getMaintenanceAlerts } from '@/services/maintenance';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'TECHNICIAN', 'SALES', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const rule = url.searchParams.get('rule') as any;
    const status = url.searchParams.get('status') as any;
    const installationId = url.searchParams.get('installationId') || undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;

    const alerts = await getMaintenanceAlerts({
      rule: rule || undefined,
      status: status || undefined,
      installationId,
      limit,
    });

    return NextResponse.json(alerts);
  }
);

