import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getScheduleGrid } from '@/services/scheduling';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'OPERATIONS', 'SALES'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const startStr = url.searchParams.get('startDate');
    const endStr = url.searchParams.get('endDate');

    const startDate = startStr ? new Date(startStr) : new Date();
    const endDate = endStr ? new Date(endStr) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const data = await getScheduleGrid(startDate, endDate);
    return NextResponse.json(data);
  }
);

