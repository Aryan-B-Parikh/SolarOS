/**
 * SunPower Ops - Predictive Maintenance & Warranty Reminder Service (Spec 6.3 Phase 8, TRD 2.4, C12)
 * Executes daily maintenance evaluation, scores active installations,
 * creates idempotent alerts without duplicates, enqueues customer reminders,
 * and converts alerts to service tickets.
 */

import { prisma } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import { recordAudit } from '../lib/audit.ts';
import { queueNotification } from '../lib/outbox.ts';
import {
  evaluateInstallationMaintenanceRules,
  calculateAggregateRiskScore,
  type MaintenanceRule as DomainMaintenanceRule,
  type MaintenanceAlertCandidate,
} from '../domain/maintenance.ts';
import { createTicket } from './tickets.ts';
import { MaintenanceRule, MaintenanceStatus, UnitStatus, WarrantyStatus } from '@prisma/client';

export interface MaintenanceJobResult {
  evaluatedInstallations: number;
  totalAlertsGenerated: number;
  newAlertsCreated: number;
  duplicateAlertsSkipped: number;
  customerRemindersQueued: number;
  executionTimeMs: number;
}

export interface ConvertAlertToTicketDto {
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  description?: string;
}

/**
 * Runs the daily predictive maintenance job.
 * Evaluates all active installations, creates idempotent alerts,
 * and enqueues customer warranty reminders without duplicate creations.
 */
export async function runMaintenanceJob(referenceDate: Date = new Date()): Promise<MaintenanceJobResult> {
  const startTime = Date.now();
  const ninetyDaysAgo = new Date(referenceDate.getTime() - 90 * 24 * 3600 * 1000);

  // 1. Fetch active installations with order, customer, units, and tickets
  const installations = await prisma.installation.findMany({
    where: {
      status: 'COMPLETED',
    },
    include: {
      order: {
        include: {
          customer: true,
        },
      },
      inventory_units: {
        include: {
          product: true,
          warranties: {
            where: { status: WarrantyStatus.ACTIVE },
            take: 1,
            orderBy: { created_at: 'desc' },
          },
        },
      },
      service_tickets: {
        where: {
          created_at: { gte: ninetyDaysAgo },
        },
        select: {
          id: true,
          unit_id: true,
          created_at: true,
        },
      },
    },
  });

  // 2. Compute model failure rates across all deployed units in the past 90 days
  const allTicketsLast90 = await prisma.serviceTicket.findMany({
    where: { created_at: { gte: ninetyDaysAgo }, unit_id: { not: null } },
    include: { unit: { include: { product: true } } },
  });

  const ticketsByModel: Record<string, number> = {};
  for (const t of allTicketsLast90) {
    if (t.unit?.product?.model) {
      ticketsByModel[t.unit.product.model] = (ticketsByModel[t.unit.product.model] || 0) + 1;
    }
  }

  const allActiveUnits = await prisma.inventoryUnit.findMany({
    where: { status: UnitStatus.INSTALLED },
    include: { product: true },
  });

  const unitsByModel: Record<string, number> = {};
  for (const u of allActiveUnits) {
    if (u.product?.model) {
      unitsByModel[u.product.model] = (unitsByModel[u.product.model] || 0) + 1;
    }
  }

  const modelFailureRates: Record<string, number> = {};
  for (const [model, count] of Object.entries(unitsByModel)) {
    const tCount = ticketsByModel[model] || 0;
    modelFailureRates[model] = count > 0 ? tCount / count : 0;
  }

  let totalAlertsGenerated = 0;
  let newAlertsCreated = 0;
  let duplicateAlertsSkipped = 0;
  let customerRemindersQueued = 0;

  // 3. Process each installation inside a transaction
  for (const inst of installations) {
    const installedOn = inst.finished_at || inst.started_at || inst.scheduled_on;

    // Build unit inspection context
    const unitDataList = inst.inventory_units.map((u) => {
      const ticketsCount = inst.service_tickets.filter((t) => t.unit_id === u.id).length;
      const activeWarr = u.warranties[0];
      return {
        id: u.id,
        productId: u.product_id,
        model: u.product?.model || 'Generic',
        category: u.product?.category || 'EQUIPMENT',
        serialNumber: u.serial_number,
        deliveredOn: u.delivered_on,
        activeWarranty: activeWarr
          ? {
              id: activeWarr.id,
              endDate: activeWarr.end_date.toISOString().split('T')[0],
            }
          : null,
        ticketCountIn90Days: ticketsCount,
      };
    });

    const candidateAlerts = evaluateInstallationMaintenanceRules(
      {
        installationId: inst.id,
        orderNumber: inst.order.order_number,
        customerName: inst.order.customer.name,
        customerPhone: inst.order.customer.phone,
        systemType: inst.order.system_type as any,
        installedOn,
        units: unitDataList,
        modelFailureRates,
      },
      referenceDate
    );

    totalAlertsGenerated += candidateAlerts.length;

    for (const candidate of candidateAlerts) {
      const dueDate = new Date(candidate.dueOn);

      // Check for existing alert with composite unique [installation_id, rule, due_on]
      const existing = await prisma.maintenanceAlert.findUnique({
        where: {
          installation_id_rule_due_on: {
            installation_id: candidate.installationId,
            rule: candidate.rule as MaintenanceRule,
            due_on: dueDate,
          },
        },
      });

      if (existing) {
        duplicateAlertsSkipped++;
        continue;
      }

      // Create new alert
      await prisma.maintenanceAlert.create({
        data: {
          installation_id: candidate.installationId,
          unit_id: candidate.unitId || null,
          rule: candidate.rule as MaintenanceRule,
          risk_score: candidate.riskScore,
          due_on: dueDate,
          reason: candidate.reason,
          status: MaintenanceStatus.PENDING,
        },
      });
      newAlertsCreated++;

      // If customer warranty reminder, enqueue Outbox message (FR-7.10 / AUTO-12)
      if (candidate.rule === 'WARRANTY_REMINDER_CUSTOMER') {
        const matchingUnit = unitDataList.find((u) => u.id === candidate.unitId);
        const endDateStr = matchingUnit?.activeWarranty?.endDate || candidate.dueOn;

        await queueNotification({
          channel: 'SMS',
          recipient: inst.order.customer.phone,
          template: 'WARRANTY_EXPIRY_REMINDER',
          payload: {
            customerId: inst.order.customer.id,
            customerName: inst.order.customer.name,
            serialNumber: matchingUnit?.serialNumber || 'Solar Equipment',
            endDate: endDateStr,
            message: `Dear ${inst.order.customer.name}, your solar equipment warranty expires on ${endDateStr}. Contact SunPower Ops to schedule an annual maintenance check.`,
          },
          // Idempotent per installation + due date: cron re-runs never double-send
          idempotencyKey: `warranty-reminder:${candidate.installationId}:${candidate.dueOn}`,
        });
        customerRemindersQueued++;
      }
    }
  }

  return {
    evaluatedInstallations: installations.length,
    totalAlertsGenerated,
    newAlertsCreated,
    duplicateAlertsSkipped,
    customerRemindersQueued,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Lists maintenance alerts with optional filtering.
 */
export async function getMaintenanceAlerts(filters?: {
  rule?: MaintenanceRule;
  status?: MaintenanceStatus;
  installationId?: string;
  limit?: number;
}) {
  return prisma.maintenanceAlert.findMany({
    where: {
      ...(filters?.rule ? { rule: filters.rule } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.installationId ? { installation_id: filters.installationId } : {}),
    },
    include: {
      installation: {
        include: {
          order: {
            include: { customer: true },
          },
        },
      },
      unit: {
        include: { product: true },
      },
      ticket: true,
    },
    orderBy: [{ risk_score: 'desc' }, { created_at: 'desc' }],
    take: filters?.limit || 50,
  });
}

/**
 * Converts a pending maintenance alert into a live Service Ticket.
 */
export async function convertAlertToTicket(
  alertId: string,
  dto: ConvertAlertToTicketDto = {},
  actorId?: string
) {
  const alert = await prisma.maintenanceAlert.findUnique({
    where: { id: alertId },
    include: {
      installation: {
        include: {
          order: { include: { customer: true } },
        },
      },
      unit: true,
    },
  });

  if (!alert) {
    throw new AppError('NOT_FOUND', 'Maintenance alert not found', 404);
  }

  if (alert.ticket_id) {
    throw new AppError('CONFLICT', 'Maintenance alert already has an associated service ticket', 409);
  }

  const customerId = alert.installation.order.customer_id;
  const unitId = alert.unit_id || undefined;
  const description = dto.description || `Preventive Maintenance Alert: ${alert.reason}`;
  const priority = dto.priority || (alert.risk_score >= 70 ? 'HIGH' : 'NORMAL');

  // Create service ticket
  const ticket = await createTicket(
    {
      customerId,
      installationId: alert.installation_id,
      unitId,
      channel: 'MAINTENANCE_ALERT',
      category: 'OTHER',
      description,
      priority,
    },
    actorId
  );

  // Update alert status and link ticket
  await prisma.maintenanceAlert.update({
    where: { id: alert.id },
    data: {
      status: MaintenanceStatus.ACKNOWLEDGED,
      ticket_id: ticket.id,
    },
  });

  await recordAudit({
    actorType: 'USER',
    actorId,
    entityType: 'maintenance_alert',
    entityId: alert.id,
    action: 'CONVERT_TO_TICKET',
    after: { ticketId: ticket.id, ticketNumber: ticket.ticket_number },
  });

  return ticket;
}

