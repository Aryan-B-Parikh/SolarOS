import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { transitionLead } from '@/services/leads';
import { LeadTransitionSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: LeadTransitionSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[4]; // /api/v1/leads/[id]/transitions

    const updated = await transitionLead(id, body.toStatus, body.reason, user?.id);
    return NextResponse.json({ lead: updated });
  }
);
