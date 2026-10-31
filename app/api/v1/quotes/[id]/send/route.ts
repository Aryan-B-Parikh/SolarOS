import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { sendQuote } from '@/services/quotes';

export const POST = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const quoteId = parts[parts.indexOf('quotes') + 1];

    const result = await sendQuote(quoteId, user);
    return NextResponse.json(result);
  }
);
