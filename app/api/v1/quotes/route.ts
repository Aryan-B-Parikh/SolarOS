import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getQuotes, createQuote } from '@/services/quotes';
import { CreateQuoteSchema } from '@/contracts';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId') || undefined;
    const quotes = await getQuotes({ leadId });
    return NextResponse.json({ quotes });
  }
);

export const POST = createApiHandler(
  {
    bodySchema: CreateQuoteSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ body, user }) => {
    const quote = await createQuote(body, user);
    return NextResponse.json({ quote }, { status: 201 });
  }
);
