import React from 'react';
import { prisma } from '@/lib/db';
import QuoteBuilderClient from './QuoteBuilderClient';

export const dynamic = 'force-dynamic';

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams?: { leadId?: string };
}) {
  const [leads, templates] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: { in: ['SURVEY_APPROVED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'QUOTED'] },
      },
      include: { customer: true, survey: true, assessment: true },
      orderBy: { created_at: 'desc' },
    }),
    prisma.systemTemplate.findMany({
      where: { is_active: true },
      include: {
        bom_lines: {
          include: { product: true },
          orderBy: { sort_order: 'asc' },
        },
      },
      orderBy: { capacity_kw: 'asc' },
    }),
  ]);

  return (
    <QuoteBuilderClient
      leads={leads as any}
      templates={templates as any}
      initialLeadId={searchParams?.leadId}
    />
  );
}

