import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { DuplicateFlagStatus } from '@prisma/client';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const id = url.pathname.split('/')[4]; // /api/v1/leads/[id]/duplicates

    const flags = await prisma.leadDuplicateFlag.findMany({
      where: { lead_id: id },
      include: {
        matched_customer: true,
        matched_lead: true,
        resolver: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ flags });
  }
);

