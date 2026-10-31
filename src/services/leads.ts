import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { getNextSequence } from '@/lib/sequences';
import { normalizePhone, isAddressDuplicate } from '@/domain/duplicates';
import { validateTransition } from '@/domain/state-machines/transitions';
import { LeadSource, LeadStatus, SystemType, LeadActivityType, DuplicateFlagStatus } from '@prisma/client';
import { rupeesToPaise } from '@/lib/money';

export interface CreateLeadDto {
  name: string;
  phone: string;
  email?: string;
  address: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode: string;
  source?: LeadSource;
  requestedCapacityKw?: number;
  systemTypePref?: SystemType;
  wantsSubsidy?: boolean;
  monthlyBillRupees?: number;
  ownerId?: string;
}

export async function createLead(data: CreateLeadDto, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const normalizedPhone = normalizePhone(data.phone);

    // 1. Customer resolution (Exact phone match)
    let customer = await tx.customer.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!customer) {
      const customerNumber = await getNextSequence('customer', undefined, tx);
      customer = await tx.customer.create({
        data: {
          customer_number: customerNumber,
          name: data.name,
          phone: normalizedPhone,
          email: data.email || null,
          address: data.address,
          address_line2: data.addressLine2 || null,
          city: data.city || 'Ahmedabad',
          state: data.state || 'Gujarat',
          pincode: data.pincode,
        },
      });
    }

    // 2. Round-robin sales allocation if ownerId not provided
    let assignedOwnerId = data.ownerId;
    if (!assignedOwnerId) {
      const salesUsers = await tx.user.findMany({
        where: { role: 'SALES', is_active: true },
        orderBy: { last_login_at: 'desc' },
      });
      if (salesUsers.length > 0) {
        // Pick least loaded sales rep
        const counts = await tx.lead.groupBy({
          by: ['owner_id'],
          where: {
            owner_id: { in: salesUsers.map((u) => u.id) },
            status: { notIn: ['WON', 'LOST', 'DISQUALIFIED'] },
          },
          _count: { id: true },
        });
        const loadMap = new Map(counts.map((c) => [c.owner_id, c._count.id]));
        const sorted = [...salesUsers].sort((a, b) => (loadMap.get(a.id) || 0) - (loadMap.get(b.id) || 0));
        assignedOwnerId = sorted[0].id;
      }
    }

    // 3. Lead Creation
    const leadNumber = await getNextSequence('lead', undefined, tx);
    const slaDueAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 business hours SLA

    const lead = await tx.lead.create({
      data: {
        lead_number: leadNumber,
        customer_id: customer.id,
        source: data.source || LeadSource.WEB,
        status: LeadStatus.NEW,
        owner_id: assignedOwnerId || null,
        requested_capacity_kw: data.requestedCapacityKw || null,
        system_type_pref: data.systemTypePref || SystemType.ON_GRID,
        wants_subsidy: data.wantsSubsidy ?? false,
        monthly_bill_paise: data.monthlyBillRupees ? rupeesToPaise(data.monthlyBillRupees) : null,
        sla_due_at: slaDueAt,
      },
    });

    // 4. Duplicate Address Check
    const existingCustomers = await tx.customer.findMany({
      where: {
        id: { not: customer.id },
        pincode: data.pincode,
      },
      take: 20,
    });

    for (const existing of existingCustomers) {
      const match = isAddressDuplicate(data.address, data.pincode, existing.address, existing.pincode);
      if (match.isDuplicate) {
        await tx.leadDuplicateFlag.create({
          data: {
            lead_id: lead.id,
            matched_customer_id: existing.id,
            score: match.score,
            status: DuplicateFlagStatus.OPEN,
          },
        });
      }
    }

    // 5. Initial Activity & Audit
    await tx.leadActivity.create({
      data: {
        lead_id: lead.id,
        type: LeadActivityType.STATUS_CHANGE,
        body: `Lead created from ${data.source || 'WEB'}. SLA due by ${slaDueAt.toLocaleTimeString('en-IN')}`,
        actor_id: actorId || null,
      },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'CUSTOMER',
        actorId: actorId || undefined,
        entityType: 'LEAD',
        entityId: lead.id,
        action: 'LEAD_CREATED',
        after: { leadNumber, customerId: customer.id, status: 'NEW' },
      },
      tx
    );

    return lead;
  });
}

export async function getLeads(filters?: { status?: LeadStatus; ownerId?: string }) {
  return prisma.lead.findMany({
    where: {
      status: filters?.status,
      owner_id: filters?.ownerId,
    },
    include: {
      customer: true,
      owner: { select: { id: true, name: true, email: true } },
      duplicate_flags: { where: { status: DuplicateFlagStatus.OPEN } },
      _count: { select: { activities: true, quotes: true } },
    },
    orderBy: { created_at: 'desc' },
  });
}

export async function getLeadById(id: string) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      customer: true,
      owner: { select: { id: true, name: true, email: true } },
      activities: {
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { created_at: 'desc' },
      },
      duplicate_flags: {
        include: {
          matched_customer: true,
          resolver: { select: { name: true } },
        },
      },
      survey: {
        include: {
          surveyor: { select: { name: true } },
          reviewer: { select: { name: true } },
        },
      },
      assessment: true,
      quotes: {
        orderBy: { version: 'desc' },
      },
    },
  });

  if (!lead) {
    throw new AppError('NOT_FOUND', 'Lead not found', 404);
  }

  return lead;
}

export async function qualifyLead(
  id: string,
  data: {
    roofAreaSqm: number;
    monthlyBillRupees?: number;
    monthlyUnits?: number;
    tariffRupees?: number;
    gridOk: boolean;
    sanctionedLoadKw: number;
    phase: 'SINGLE' | 'THREE';
  },
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);

    // Transition check
    if (lead.status === LeadStatus.NEW) {
      validateTransition('LEAD', 'NEW', 'CONTACTED');
      validateTransition('LEAD', 'CONTACTED', 'QUALIFIED');
    } else if (lead.status === LeadStatus.CONTACTED) {
      validateTransition('LEAD', 'CONTACTED', 'QUALIFIED');
    } else if (lead.status !== LeadStatus.QUALIFIED) {
      validateTransition('LEAD', lead.status, 'QUALIFIED');
    }

    const updated = await tx.lead.update({
      where: { id },
      data: {
        roof_area_sqm: data.roofAreaSqm,
        monthly_bill_paise: data.monthlyBillRupees ? rupeesToPaise(data.monthlyBillRupees) : undefined,
        monthly_units: data.monthlyUnits,
        tariff_paise: data.tariffRupees ? rupeesToPaise(data.tariffRupees) : 700n,
        grid_ok: data.gridOk,
        sanctioned_load_kw: data.sanctionedLoadKw,
        phase: data.phase,
        status: LeadStatus.QUALIFIED,
        first_contacted_at: lead.first_contacted_at || new Date(),
      },
    });

    await tx.leadActivity.create({
      data: {
        lead_id: id,
        type: LeadActivityType.STATUS_CHANGE,
        body: `Lead qualified: ${data.roofAreaSqm} sqm roof, ${data.sanctionedLoadKw} kW load, ${data.phase} phase`,
        actor_id: actorId || null,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'LEAD',
        entityId: id,
        action: 'LEAD_QUALIFIED',
        before: { status: lead.status },
        after: { status: LeadStatus.QUALIFIED, roofAreaSqm: data.roofAreaSqm },
      },
      tx
    );

    return updated;
  });
}

export async function transitionLead(
  id: string,
  toStatus: LeadStatus,
  reason?: string,
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);

    validateTransition('LEAD', lead.status, toStatus);

    const updateData: any = {
      status: toStatus,
    };

    if (toStatus === LeadStatus.CONTACTED && !lead.first_contacted_at) {
      updateData.first_contacted_at = new Date();
    }
    if ((toStatus === LeadStatus.LOST || toStatus === LeadStatus.DISQUALIFIED) && reason) {
      updateData.lost_reason = reason;
    }

    const updated = await tx.lead.update({
      where: { id },
      data: updateData,
    });

    await tx.leadActivity.create({
      data: {
        lead_id: id,
        type: LeadActivityType.STATUS_CHANGE,
        body: `Status changed to ${toStatus}${reason ? `: ${reason}` : ''}`,
        actor_id: actorId || null,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'LEAD',
        entityId: id,
        action: 'LEAD_STATUS_CHANGED',
        before: { status: lead.status },
        after: { status: toStatus, reason },
      },
      tx
    );

    return updated;
  });
}

export async function resolveDuplicateFlag(
  flagId: string,
  action: 'LINK' | 'DISMISS',
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    const flag = await tx.leadDuplicateFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new AppError('NOT_FOUND', 'Duplicate flag not found', 404);

    const newStatus = action === 'LINK' ? DuplicateFlagStatus.LINKED : DuplicateFlagStatus.DISMISSED;

    await tx.leadDuplicateFlag.update({
      where: { id: flagId },
      data: {
        status: newStatus,
        resolved_by: actorId,
        resolved_at: new Date(),
      },
    });

    if (action === 'LINK') {
      await tx.lead.update({
        where: { id: flag.lead_id },
        data: { customer_id: flag.matched_customer_id },
      });
    }

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'LEAD_DUPLICATE_FLAG',
        entityId: flagId,
        action: `FLAG_${newStatus}`,
      },
      tx
    );

    return { success: true, status: newStatus };
  });
}

export async function addLeadActivity(
  leadId: string,
  type: LeadActivityType,
  body: string,
  actorId?: string
) {
  return prisma.leadActivity.create({
    data: {
      lead_id: leadId,
      type,
      body,
      actor_id: actorId || null,
    },
  });
}
