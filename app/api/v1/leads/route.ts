import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getLeads, createLead } from '@/services/leads';
import { CreateStaffLeadSchema } from '@/contracts';

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

// Staff-logged enquiry (FR-1.2): keeps source + ownerId from the payload.
// The public web form uses POST /api/v1/public/enquiries instead.
export const POST = createApiHandler(
  {
    bodySchema: CreateStaffLeadSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ body, user }) => {
    const lead = await createLead(body, body.ownerId || user?.id);
    return NextResponse.json({ lead }, { status: 201 });
  }
);
