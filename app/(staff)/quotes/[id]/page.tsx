import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import QuoteDetailClient from './QuoteDetailClient';

export const dynamic = 'force-dynamic';

/** BigInt-safe serialization (paise -> string) for the client component. */
function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (typeof v === 'bigint') return v.toString();
      return v;
    })
  );
}

export default async function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      lead: { include: { survey: true, assessment: true } },
      template: true,
      discount_approver: { select: { id: true, name: true, role: true } },
      lines: {
        include: { product: true },
        orderBy: { sort_order: 'asc' },
      },
      order: true,
    },
  });

  if (!quote) notFound();

  // Version history (FR-3.6): the full supersedes chain for this lead,
  // oldest version first. Superseded versions are read-only.
  const versions = quote
    ? await prisma.quote.findMany({
        where: { lead_id: quote.lead_id },
        select: {
          id: true,
          quote_number: true,
          version: true,
          status: true,
          total_paise: true,
          supersedes_id: true,
          created_at: true,
        },
        orderBy: { version: 'asc' },
      })
    : [];

  const user = await getSessionUser();

  return (
    <QuoteDetailClient
      initialQuote={serialize(quote)}
      versions={serialize(versions)}
      currentUser={user ? { id: user.id, name: user.name, role: user.role as string } : null}
    />
  );
}
