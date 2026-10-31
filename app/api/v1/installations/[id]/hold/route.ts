import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { holdInstallation } from '@/services/installations';
import { HoldInstallationSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: HoldInstallationSchema,
    allowedRoles: ['DIRECTOR', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];

    const result = await holdInstallation({
      installationId,
      holdReason: body.holdReason,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

