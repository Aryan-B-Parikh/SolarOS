import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { getCustomerTicketContext } from '@/services/tickets';

export const dynamic = 'force-dynamic';

/**
 * FR-7.3 — customer equipment context for the staff ticket creation form:
 * installations + installed serialized units with live warranty verdicts
 * (selecting a unit drives the automatic warranty verdict).
 */
const UnitsQuerySchema = z.object({
  customerId: z.string().uuid('Valid customer UUID required'),
});

export const GET = createApiHandler(
  {
    querySchema: UnitsQuerySchema,
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'SALES', 'TECHNICIAN'],
  },
  async ({ query }) => {
    const context = await getCustomerTicketContext(query.customerId);
    return NextResponse.json(context);
  }
);
