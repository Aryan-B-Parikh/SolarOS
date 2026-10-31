import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { acceptQuote } from '@/services/quotes';
import { QuoteDecisionSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: QuoteDecisionSchema,
    public: true,
  },
  async ({ req, body }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const quoteId = parts[parts.indexOf('quotes') + 1];

    const result = await acceptQuote(quoteId, {
      acceptedName: body.acceptedName || 'Customer',
      phoneLastFour: body.phoneLastFour,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(result);
  }
);

