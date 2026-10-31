import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { signOffInstallation } from '@/services/installations';
import { InstallationSignoffSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: InstallationSignoffSchema,
    allowedRoles: ['DIRECTOR', 'TECHNICIAN'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const installationId = parts[parts.indexOf('installations') + 1];

    const result = await signOffInstallation({
      installationId,
      checklist: body.checklist,
      installedCapacityKw: body.installedCapacityKw,
      testReadingW: body.testReadingW,
      signedName: body.signedName,
      signatureAttachmentId: body.signatureAttachmentId,
      photoAttachmentIds: body.photoAttachmentIds,
      idempotencyKey: body.idempotencyKey,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

