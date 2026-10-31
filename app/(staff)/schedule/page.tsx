import React from 'react';
import { prisma } from '@/lib/db';
import ScheduleClient from './ScheduleClient';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const [technicians, installations, pendingJobs] = await Promise.all([
    prisma.technician.findMany({
      include: {
        user: { select: { id: true, name: true, phone: true } },
        leaves: true,
      },
      orderBy: { is_crew_lead: 'desc' },
    }),
    prisma.installation.findMany({
      include: {
        order: {
          include: {
            customer: { select: { name: true, city: true, pincode: true, lat: true, lng: true } },
          },
        },
        crew_lead: { select: { id: true, name: true } },
        crew: { include: { technician: { include: { user: true } } } },
      },
      orderBy: { scheduled_on: 'asc' },
    }),
    // Installations needing scheduling: scheduled jobs without a crew lead (FR-4.6)
    prisma.installation.findMany({
      where: {
        status: 'SCHEDULED',
        crew_lead_id: null,
      },
      include: {
        order: {
          include: {
            customer: { select: { name: true, city: true, pincode: true } },
          },
        },
      },
      orderBy: { scheduled_on: 'asc' },
    }),
  ]);

  const serializeTech = (t: any) => ({
    user_id: t.user_id,
    is_crew_lead: t.is_crew_lead,
    skills: t.skills,
    leaves: t.leaves.map((l: any) => ({
      starts_on: l.starts_on.toISOString().slice(0, 10),
      ends_on: l.ends_on.toISOString().slice(0, 10),
    })),
    user: t.user,
  });

  return (
    <ScheduleClient
      technicians={technicians.map(serializeTech)}
      installations={installations.map((i: any) => ({
        id: i.id,
        order_id: i.order_id,
        status: i.status,
        slot: i.slot,
        scheduled_on: i.scheduled_on.toISOString().slice(0, 10),
        crew_lead_id: i.crew_lead_id,
        crew: i.crew.map((c: any) => ({ technician_id: c.technician_id })),
        order: {
          order_number: i.order.order_number,
          capacity_kw: Number(i.order.capacity_kw),
          system_type: i.order.system_type,
          customer: i.order.customer,
        },
      }))}
      pendingJobs={pendingJobs.map((i: any) => ({
        id: i.id,
        order_id: i.order_id,
        scheduled_on: i.scheduled_on.toISOString().slice(0, 10),
        slot: i.slot,
        order: {
          order_number: i.order.order_number,
          capacity_kw: Number(i.order.capacity_kw),
          system_type: i.order.system_type,
          customer: i.order.customer,
        },
      }))}
    />
  );
}
