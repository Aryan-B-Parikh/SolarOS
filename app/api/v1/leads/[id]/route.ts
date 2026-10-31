import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getLeadById, qualifyLead } from '@/services/leads';
import { QualifyLeadSchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const id = url.pathname.split('/')[4]; // /api/v1/leads/[id]

    const lead = await getLeadById(id);
    return NextResponse.json({ lead });
  }
);

export const PATCH = createApiHandler(
  {
    bodySchema: QualifyLeadSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const id = url.pathname.split('/')[4];

    const lead = await qualifyLead(id, body, user?.id);
    return NextResponse.json({ lead });
  }
);
