import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { resumeInstallation } from '@/services/installations';

export const POST = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'TECHNICIAN'],
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];

    const result = await resumeInstallation({
      installationId,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

