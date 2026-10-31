import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { SearchQuerySchema } from '@/contracts';
import { globalSearch } from '@/services/search';

export const GET = createApiHandler(
  {
    querySchema: SearchQuerySchema,
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT', 'TECHNICIAN', 'WAREHOUSE', 'ACCOUNTS'],
  },
  async ({ query }) => {
    const results = await globalSearch(query.q);
    return NextResponse.json(results);
  }
);
