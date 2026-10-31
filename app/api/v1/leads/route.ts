import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getLeads, createLead } from '@/services/leads';
import { CreateEnquirySchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req, user }) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as any;
    const ownerId = searchParams.get('ownerId') || undefined;

    const leads = await getLeads({ status, ownerId });
    return NextResponse.json({ leads });
  }
);

export const POST = createApiHandler(
  {
    bodySchema: CreateEnquirySchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ body, user }) => {
    const lead = await createLead(body, user?.id);
    return NextResponse.json({ lead }, { status: 201 });
  }
);

