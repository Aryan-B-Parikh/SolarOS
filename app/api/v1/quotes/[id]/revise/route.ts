import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { reviseQuote } from '@/services/quotes';
import { ReviseQuoteSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: ReviseQuoteSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const quoteId = parts[parts.indexOf('quotes') + 1];

    const newQuote = await reviseQuote(quoteId, body, user ? { id: user.id, role: user.role } : undefined);
    return NextResponse.json({ quote: newQuote }, { status: 201 });
  }
);

