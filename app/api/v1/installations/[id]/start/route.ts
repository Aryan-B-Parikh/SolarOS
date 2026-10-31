import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { startInstallation } from '@/services/installations';
import { StartInstallationSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: StartInstallationSchema,
    allowedRoles: ['DIRECTOR', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];

    const result = await startInstallation({
      installationId,
      lat: body?.lat,
      lng: body?.lng,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

