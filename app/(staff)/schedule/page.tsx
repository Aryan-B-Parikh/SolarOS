import React from 'react';
import { prisma } from '@/lib/db';
import ScheduleClient from './ScheduleClient';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const [technicians, installations, unassignedJobs] = await Promise.all([
    prisma.technician.findMany({
      include: {
        user: { select: { id: true, name: true, phone: true } },
        leaves: true,
      },
      orderBy: { is_crew_lead: 'desc' },
    }),
    prisma.installation.findMany({
      include: {
        order: { include: { customer: true } },
        crew_lead: true,
        crew: { include: { technician: { include: { user: true } } } },
      },
      orderBy: { scheduled_on: 'asc' },
    }),
    prisma.installation.findMany({
      where: {
        status: { in: ['SCHEDULED', 'ON_HOLD'] },
      },
      include: {
        order: { include: { customer: true } },
        crew_lead: true,
      },
    }),
  ]);

  return (
    <ScheduleClient
      technicians={technicians as any}
      installations={installations as any}
      unassignedJobs={unassignedJobs as any}
    />
  );
}

