import React from 'react';
import { prisma } from '@/lib/db';
import { getAnalyticsSummary, getProjectProfitabilityList } from '@/services/analytics';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

/** BigInt-safe serialization for client components (paise -> string). */
function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Date) return v.toISOString();
      return v;
    })
  );
}

export default async function DashboardPage() {
  const [summary, projects, openTickets, leads, orders] = await Promise.all([
    getAnalyticsSummary(),
    getProjectProfitabilityList({ limit: 100 }),
    prisma.serviceTicket.findMany({
      where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      include: { customer: true },
      orderBy: { created_at: 'desc' },
      take: 8,
    }),
    prisma.lead.findMany({
      where: { status: { in: ['SURVEY_SCHEDULED', 'QUALIFIED'] } },
      select: { id: true, status: true, survey: { select: { status: true } } },
    }),
    prisma.order.findMany({
      where: { status: { in: ['PENDING_ADVANCE', 'CONFIRMED'] } },
      select: { id: true, status: true },
    }),
  ]);

  // Real pending-work counts (FR-8.3).
  const pendingSteps = {
    leadsAwaitingSurvey: leads.filter((l) => l.status === 'SURVEY_SCHEDULED' && l.survey?.status === 'SCHEDULED')
      .length,
    surveysAwaitingReview: leads.filter(
      (l) => l.status === 'SURVEY_SCHEDULED' && l.survey?.status === 'COMPLETED'
    ).length,
    ordersPendingAdvance: orders.filter((o) => o.status === 'PENDING_ADVANCE').length,
    ordersConfirmed: orders.filter((o) => o.status === 'CONFIRMED').length,
  };

  return (
    <DashboardClient
      initialSummary={serialize(summary)}
      projects={serialize(projects || [])}
      tickets={serialize(openTickets || [])}
      pendingSteps={pendingSteps}
    />
  );
}
