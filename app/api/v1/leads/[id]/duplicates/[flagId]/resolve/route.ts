import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { resolveDuplicateFlag } from '@/services/leads';
import { z } from 'zod';

const ResolveFlagSchema = z.object({
  action: z.enum(['LINK', 'DISMISS']),
});

export const POST = createApiHandler(
  {
    bodySchema: ResolveFlagSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    // /api/v1/leads/[id]/duplicates/[flagId]/resolve
    const flagId = parts[6];

    const result = await resolveDuplicateFlag(flagId, body.action, user!.id);
    return NextResponse.json(result);
  }
);
