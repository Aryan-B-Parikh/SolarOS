import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { updateQuoteLine } from '@/services/quotes';
import { UpdateQuoteLineSchema } from '@/contracts';

export const PATCH = createApiHandler(
  {
    bodySchema: UpdateQuoteLineSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const quoteId = parts[parts.indexOf('quotes') + 1];

    const updatedQuote = await updateQuoteLine(
      quoteId,
      body,
      user ? { id: user.id, role: user.role } : undefined
    );
    return NextResponse.json({ quote: updatedQuote });
  }
);

