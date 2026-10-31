import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getQuoteById } from '@/services/quotes';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.indexOf('quotes') + 1];

    const quote = await getQuoteById(id);
    return NextResponse.json({ quote });
  }
);

