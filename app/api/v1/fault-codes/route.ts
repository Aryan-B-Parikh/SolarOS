import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getFaultCodeCatalogue } from '@/services/tickets';

export const dynamic = 'force-dynamic';

/**
 * FR-7.9 — fault codes served from the fault_codes DB table (seeded per
 * inverter model), grouped by model. Consumed by the staff ticket form and
 * (server-side) by the customer portal ticket form.
 */
export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SUPPORT', 'SALES', 'TECHNICIAN', 'ACCOUNTS', 'WAREHOUSE'],
  },
  async () => {
    const catalogue = await getFaultCodeCatalogue();
    return NextResponse.json(catalogue);
  }
);
