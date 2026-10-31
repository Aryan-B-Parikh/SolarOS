import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getInstallation } from '@/services/installations';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'TECHNICIAN', 'SALES', 'SUPPORT'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];

    const result = await getInstallation(installationId);
    return NextResponse.json(result);
  }
);

