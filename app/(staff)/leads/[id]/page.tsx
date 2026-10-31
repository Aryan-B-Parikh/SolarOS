import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { getLeadById } from '@/services/leads';
import LeadDetailClient from './LeadDetailClient';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const lead = await getLeadById(params.id);
    const technicians = await prisma.technician.findMany({
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    const templates = await prisma.systemTemplate.findMany({
      where: { is_active: true },
    });

    return (
      <LeadDetailClient
        initialLead={lead as any}
        technicians={technicians as any}
        templates={templates as any}
      />
    );
  } catch (err: any) {
    notFound();
  }
}
