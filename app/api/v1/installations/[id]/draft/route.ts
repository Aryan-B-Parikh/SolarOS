import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { updateInstallationDraft } from '@/services/installations';
import { UpdateInstallationDraftSchema } from '@/contracts';

export const PATCH = createApiHandler(
  {
    bodySchema: UpdateInstallationDraftSchema,
    allowedRoles: ['DIRECTOR', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];

    const result = await updateInstallationDraft({
      installationId,
      checklist: body?.checklist,
      installedCapacityKw: body?.installedCapacityKw,
      testReadingW: body?.testReadingW,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

