import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { recordPayment } from '@/services/payments';
import { RecordPaymentSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: RecordPaymentSchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ req, body, user }) => {
    const result = await recordPayment(body, user?.id || 'accounts');
    return NextResponse.json(result, { status: 201 });
  }
);
