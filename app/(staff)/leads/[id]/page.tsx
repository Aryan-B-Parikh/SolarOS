import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { getLeadById } from '@/services/leads';
import LeadDetailClient from './LeadDetailClient';

export const dynamic = 'force-dynamic';

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (typeof v === 'bigint') return v.toString();
      return v;
    })
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const lead = await getLeadById(params.id);
    if (!lead) notFound();

    const technicians = await prisma.technician.findMany({
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    const templates = await prisma.systemTemplate.findMany({
      where: { is_active: true },
    });

    return (
      <LeadDetailClient
        initialLead={serialize(lead)}
        technicians={serialize(technicians)}
        templates={serialize(templates)}
      />
    );
  } catch (err: any) {
    notFound();
  }
}
