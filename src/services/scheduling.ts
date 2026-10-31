import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import {
  CandidateCrew,
  CandidateTechnician,
  JobRequirements,
  rankCrewSuggestions,
} from '@/domain/crew-scoring';
import { InstallationStatus, OrderStatus } from '@prisma/client';

export async function suggestCrewsForOrder(orderId: string, targetDateStr?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      quote: {
        include: {
          lead: {
            include: {
              survey: true,
            },
          },
        },
      },
      installation: true,
    },
  });

  if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);

  const targetDate = targetDateStr ? new Date(targetDateStr) : order.installation?.scheduled_date || new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Fetch all active technicians
  const technicians = await prisma.technician.findMany({
    include: {
      user: true,
      leaves: {
        where: {
          status: 'APPROVED',
          date: { gte: startOfDay, lte: endOfDay },
        },
      },
      led_installations: {
        where: {
          scheduled_date: { gte: startOfDay, lte: endOfDay },
          status: { in: [InstallationStatus.SCHEDULED, InstallationStatus.IN_PROGRESS] },
        },
      },
      crew_memberships: {
        include: {
          installation: true,
        },
        where: {
          installation: {
            scheduled_date: { gte: startOfDay, lte: endOfDay },
            status: { in: [InstallationStatus.SCHEDULED, InstallationStatus.IN_PROGRESS] },
          },
        },
      },
      time_logs: {
        where: {
          started_at: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      },
    },
  });

  // Map into CandidateTechnician format
  const candidates: CandidateTechnician[] = technicians.map((t) => {
    const weeklyHours = t.time_logs.reduce((sum, log) => {
      if (log.ended_at && log.started_at) {
        return sum + (log.ended_at.getTime() - log.started_at.getTime()) / (1000 * 3600);
      }
      return sum;
    }, 0);

    const jobsCount = t.led_installations.length + t.crew_memberships.length;

    return {
      id: t.id,
      userId: t.user_id,
      name: t.user.name,
      isCrewLead: t.is_crew_lead,
      skills: (t.skills as string[]) || ['SOLAR_INSTALL'],
      hoursThisWeek: Number(weeklyHours.toFixed(1)),
      jobsOnDate: jobsCount,
      onLeaveOnDate: t.leaves.length > 0,
      baseLat: t.base_lat ? Number(t.base_lat) : undefined,
      baseLng: t.base_lng ? Number(t.base_lng) : undefined,
    };
  });

  const leads = candidates.filter((c) => c.isCrewLead);
  const helpers = candidates.filter((c) => !c.isCrewLead);

  // Generate candidate crew combinations (Lead + 1 or 2 helpers)
  const candidateCrews: CandidateCrew[] = [];
  const requiredCrewSize = Number(order.capacity_kw) > 3 ? 3 : 2;

  for (const lead of leads) {
    if (requiredCrewSize === 2) {
      for (const helper of helpers) {
        candidateCrews.push({ lead, members: [helper] });
      }
    } else {
      // 3-person crew
      for (let i = 0; i < helpers.length; i++) {
        for (let j = i + 1; j < helpers.length; j++) {
          candidateCrews.push({ lead, members: [helpers[i], helpers[j]] });
        }
      }
    }
  }

  // Fallback: If no candidate crews created from helpers, pair leads with any other technicians
  if (candidateCrews.length === 0) {
    for (const lead of leads) {
      const otherTechs = candidates.filter((c) => c.id !== lead.id);
      if (otherTechs.length >= requiredCrewSize - 1) {
        candidateCrews.push({ lead, members: otherTechs.slice(0, requiredCrewSize - 1) });
      }
    }
  }

  const jobReq: JobRequirements = {
    capacityKw: Number(order.capacity_kw),
    systemType: order.system_type as any,
    targetDate,
    surveyorUserId: order.quote?.lead?.survey?.surveyor_id || undefined,
  };

  const suggestions = rankCrewSuggestions(candidateCrews, jobReq, 3);
  return { orderId, targetDate, suggestions };
}

export async function confirmOrderSchedule(
  orderId: string,
  data: {
    crewLeadId: string; // technician id or user id
    memberIds?: string[];
    scheduledDate: string | Date;
  },
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { installation: true },
    });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);

    const scheduledDate = new Date(data.scheduledDate);

    // Find technician by id or user_id
    const leadTech = await tx.technician.findFirst({
      where: {
        OR: [{ id: data.crewLeadId }, { user_id: data.crewLeadId }],
      },
    });

    if (!leadTech) {
      throw new AppError('NOT_FOUND', 'Crew lead technician not found', 404);
    }

    // Upsert installation job
    let installation = order.installation;
    if (installation) {
      installation = await tx.installation.update({
        where: { id: installation.id },
        data: {
          crew_lead_id: leadTech.user_id,
          scheduled_date: scheduledDate,
          status: InstallationStatus.SCHEDULED,
        },
      });

      // Clear old memberships and recreate
      await tx.crewMember.deleteMany({
        where: { installation_id: installation.id },
      });
    } else {
      installation = await tx.installation.create({
        data: {
          order_id: order.id,
          crew_lead_id: leadTech.user_id,
          scheduled_date: scheduledDate,
          status: InstallationStatus.SCHEDULED,
        },
      });
    }

    // Link crew members
    if (data.memberIds && data.memberIds.length > 0) {
      const memberTechs = await tx.technician.findMany({
        where: {
          OR: [{ id: { in: data.memberIds } }, { user_id: { in: data.memberIds } }],
        },
      });

      for (const m of memberTechs) {
        await tx.crewMember.create({
          data: {
            installation_id: installation.id,
            technician_id: m.id,
            role: 'HELPER',
          },
        });
      }
    }

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'INSTALLATION',
        entityId: installation.id,
        action: 'SCHEDULE_CONFIRMED',
        after: {
          orderId: order.id,
          crewLeadUserId: leadTech.user_id,
          scheduledDate,
          memberCount: data.memberIds?.length || 0,
        },
      },
      tx
    );

    return installation;
  });
}

export async function getScheduleGrid(startDate: Date, endDate: Date) {
  const [technicians, installations, leaves] = await Promise.all([
    prisma.technician.findMany({
      include: { user: { select: { name: true, email: true, phone: true } } },
    }),
    prisma.installation.findMany({
      where: {
        scheduled_date: { gte: startDate, lte: endDate },
      },
      include: {
        order: {
          include: { customer: true },
        },
        crew_lead: { include: { user: true } },
        crew_members: { include: { technician: { include: { user: true } } } },
      },
    }),
    prisma.technicianLeave.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: 'APPROVED',
      },
    }),
  ]);

  return {
    technicians,
    installations,
    leaves,
    startDate,
    endDate,
  };
}

