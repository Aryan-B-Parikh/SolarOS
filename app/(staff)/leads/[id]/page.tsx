import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { getLeadById } from '@/services/leads';
import { getSessionUser } from '@/lib/session';
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

    const [technicians, templates, user, surveyPhotoCount] = await Promise.all([
      prisma.technician.findMany({
        include: { user: { select: { id: true, name: true, phone: true } } },
      }),
      prisma.systemTemplate.findMany({
        where: { is_active: true },
      }),
      getSessionUser(),
      lead.survey
        ? prisma.attachment.count({
            where: { owner_type: 'SURVEY', owner_id: lead.survey.id },
          })
        : Promise.resolve(0),
    ]);

    return (
      <LeadDetailClient
        initialLead={serialize(lead)}
        technicians={serialize(technicians)}
        templates={serialize(templates)}
        currentUser={user ? { id: user.id, name: user.name, role: user.role as string } : null}
        surveyPhotoCount={surveyPhotoCount}
      />
    );
  } catch (err: any) {
    notFound();
  }
}
