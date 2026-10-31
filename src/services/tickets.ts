/**
 * SunPower Ops - Service Desk & Warranty Engine Service (Spec 6.3 Phase 7, TRD 2.4, PRD C9, ADR D5)
 * Handles fast breakdown ticketing, automated warranty verdict, SLA calculation,
 * RMA part replacements with warranty transfer chain, chargeable invoice generation,
 * customer resolution confirmation, and ticket reopen workflows.
 */

import { prisma } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import { recordAudit } from '../lib/audit.ts';
import { getNextSequence } from '../lib/sequences.ts';
import { evaluateWarrantyEligibility, transferWarrantyToReplacement } from '../domain/warranty.ts';
import {
  calculateSlaDueDate,
  determineVerdictAndBilling,
  validateTicketTransition,
  type TicketPriority,
  type TicketCategory,
  type TicketChannel,
} from '../domain/tickets.ts';
import { createServiceInvoice } from './invoices.ts';
import {
  UnitStatus,
  WarrantyStatus,
  WarrantySource,
  WarrantyCoverage,
  MovementType,
  TicketStatus,
  WarrantyVerdict,
  BillingMode,
} from '@prisma/client';

export interface CreateTicketDto {
  customerId: string;
  installationId?: string;
  unitId?: string;
  serialNumber?: string;
  channel?: TicketChannel;
  category: TicketCategory;
  faultCode?: string;
  description: string;
  priority?: TicketPriority;
}

export interface ReplaceTicketPartDto {
  removedUnitCode: string; // Serial number or QR code
  replacementUnitCode: string; // Serial number or QR code
  isChargeable?: boolean;
  unitPricePaise?: number;
}

export interface ResolveTicketDto {
  resolutionNotes: string;
  isChargeable?: boolean;
  laborCostPaise?: number;
  partsCostPaise?: number;
}

export interface ConfirmTicketDto {
  confirmationMethod?: 'PORTAL' | 'PHONE';
  customerFeedback?: string;
}

export interface ReopenTicketDto {
  reason: string;
}

export interface ExcludeWarrantyDto {
  reason: string;
}

/**
 * Creates a new service ticket with automated warranty verdict and priority-based SLA.
 */
export async function createTicket(data: CreateTicketDto, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Verify customer exists
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId },
      include: {
        orders: {
          include: { installation: true },
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'Customer does not exist', 404);
    }

    // 2. Identify physical unit and evaluate warranty eligibility
    let unit: any = null;
    let activeWarranty: any = null;

    if (data.unitId) {
      unit = await tx.inventoryUnit.findUnique({
        where: { id: data.unitId },
        include: {
          product: true,
          warranties: {
            where: { status: { in: ['ACTIVE', 'TRANSFERRED', 'VOID'] } },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });
    } else if (data.serialNumber) {
      unit = await tx.inventoryUnit.findFirst({
        where: {
          OR: [
            { serial_number: { equals: data.serialNumber.trim(), mode: 'insensitive' } },
            { qr_code: { equals: data.serialNumber.trim(), mode: 'insensitive' } },
          ],
        },
        include: {
          product: true,
          warranties: {
            where: { status: { in: ['ACTIVE', 'TRANSFERRED', 'VOID'] } },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });
    }

    activeWarranty = unit?.warranties?.[0] || null;

    // 3. Compute Warranty Verdict and Billing Mode
    const verdictEvaluation = determineVerdictAndBilling(
      activeWarranty
        ? {
            id: activeWarranty.id,
            status: activeWarranty.status,
            endDate: activeWarranty.end_date,
          }
        : null,
      false,
      new Date()
    );

    const warrantyVerdict: WarrantyVerdict = verdictEvaluation.verdict as WarrantyVerdict;
    const billingMode: BillingMode = verdictEvaluation.billingMode as BillingMode;
    const warrantyId = verdictEvaluation.warrantyId;

    // 4. Calculate SLA Due Date
    const priority = data.priority || 'NORMAL';
    // Check settings for configured SLA hours
    const slaSetting = await tx.setting.findUnique({
      where: { key: 'sla_hours_by_priority' },
    });
    const slaMap = (slaSetting?.value as Record<string, number>) || undefined;
    const slaDueAt = calculateSlaDueDate(priority, new Date(), slaMap);

    // 5. Generate Ticket Number
    const ticketNumber = await getNextSequence('ticket', undefined, tx);

    // 6. Create Service Ticket in DB
    const ticket = await tx.serviceTicket.create({
      data: {
        ticket_number: ticketNumber,
        customer_id: customer.id,
        installation_id: unit?.installation_id || data.installationId || customer.orders[0]?.installation?.id || null,
        unit_id: unit?.id || null,
        warranty_id: warrantyId,
        channel: data.channel || 'PHONE',
        category: data.category,
        fault_code: data.faultCode || null,
        description: data.description,
        priority: priority as any,
        status: TicketStatus.OPEN,
        warranty_verdict: warrantyVerdict,
        billing_mode: billingMode,
        sla_due_at: slaDueAt,
        created_by: actorId || null,
        events: {
          create: {
            type: 'CREATED',
            to_status: TicketStatus.OPEN,
            note: `Ticket created via ${data.channel || 'PHONE'}. Priority: ${priority}. Verdict: ${warrantyVerdict}.`,
            actor_id: actorId || null,
          },
        },
      },
      include: {
        customer: true,
        unit: { include: { product: true } },
        warranty: true,
        events: true,
      },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'SERVICE_TICKET_CREATED',
        after: {
          ticketNumber: ticket.ticket_number,
          priority: ticket.priority,
          verdict: ticket.warranty_verdict,
          billingMode: ticket.billing_mode,
        },
      },
      tx
    );

    return ticket;
  });
}

/**
 * Assigns a technician to the service ticket and sets scheduled date.
 */
export async function assignTicket(
  ticketId: string,
  technicianId: string,
  scheduledDate?: string,
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
    }

    const technician = await tx.user.findUnique({
      where: { id: technicianId },
    });

    if (!technician) {
      throw new AppError('TECHNICIAN_NOT_FOUND', 'Technician user not found', 404);
    }

    const previousStatus = ticket.status;
    const newStatus = TicketStatus.ASSIGNED;

    const updated = await tx.serviceTicket.update({
      where: { id: ticketId },
      data: {
        assigned_to: technicianId,
        status: newStatus,
        events: {
          create: {
            type: 'ASSIGNED',
            from_status: previousStatus,
            to_status: newStatus,
            note: `Assigned to ${technician.name}${scheduledDate ? ` for scheduled date: ${scheduledDate}` : ''}`,
            actor_id: actorId || null,
          },
        },
      },
      include: {
        assignee: { select: { id: true, name: true, phone: true } },
        customer: true,
      },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'SERVICE_TICKET_ASSIGNED',
        after: {
          assignedTo: technician.name,
          scheduledDate,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Executes a parts replacement and RMA scanning flow (Rule C9, ADR D5):
 * 1. Removed unit -> status 'RMA', stock movement 'RMA_OUT'.
 * 2. Replacement unit -> status 'INSTALLED', bound to customer and installation, stock movement 'DELIVERY'.
 * 3. Warranty transfer -> parent warranty marked 'TRANSFERRED', successor warranty created inheriting EXACT original end date.
 * 4. Records TicketPart row.
 */
export async function replaceTicketPart(
  ticketId: string,
  dto: ReplaceTicketPartDto,
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        warranty: true,
      },
    });

    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
    }

    // 1. Identify removed unit
    const removedUnit = await tx.inventoryUnit.findFirst({
      where: {
        OR: [
          { serial_number: { equals: dto.removedUnitCode.trim(), mode: 'insensitive' } },
          { qr_code: { equals: dto.removedUnitCode.trim(), mode: 'insensitive' } },
        ],
      },
      include: {
        product: true,
        warranties: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (!removedUnit) {
      throw new AppError('REMOVED_UNIT_NOT_FOUND', `Removed unit '${dto.removedUnitCode}' not found`, 404);
    }

    // 2. Identify replacement unit
    const replacementUnit = await tx.inventoryUnit.findFirst({
      where: {
        OR: [
          { serial_number: { equals: dto.replacementUnitCode.trim(), mode: 'insensitive' } },
          { qr_code: { equals: dto.replacementUnitCode.trim(), mode: 'insensitive' } },
        ],
      },
      include: { product: true },
    });

    if (!replacementUnit) {
      throw new AppError('REPLACEMENT_UNIT_NOT_FOUND', `Replacement unit '${dto.replacementUnitCode}' not found`, 404);
    }

    if (replacementUnit.status !== UnitStatus.IN_STOCK) {
      throw new AppError(
        'REPLACEMENT_NOT_IN_STOCK',
        `Replacement unit is currently '${replacementUnit.status}'. Must be 'IN_STOCK' to be installed.`,
        400
      );
    }

    // Verify product compatibility
    if (removedUnit.product_id !== replacementUnit.product_id) {
      throw new AppError(
        'PRODUCT_MISMATCH',
        `Replacement product (${replacementUnit.product.name}) does not match removed unit product (${removedUnit.product.name})`,
        400
      );
    }

    const today = new Date();

    // Determine actor/creator ID for movements
    let movementActorId = actorId || ticket.created_by;
    if (!movementActorId) {
      const defaultUser = await tx.user.findFirst({ select: { id: true } });
      movementActorId = defaultUser?.id || ticket.customer_id;
    }

    // 3. Update removed unit to RMA and record movement
    await tx.inventoryUnit.update({
      where: { id: removedUnit.id },
      data: { status: UnitStatus.RMA },
    });

    await tx.stockMovement.create({
      data: {
        product_id: removedUnit.product_id,
        unit_id: removedUnit.id,
        from_location_id: removedUnit.location_id,
        to_location_id: null,
        type: MovementType.RMA_OUT,
        qty: 1,
        unit_cost_paise: removedUnit.unit_cost_paise,
        ref_type: 'ticket',
        ref_id: ticket.id,
        reason: `RMA removal under ticket ${ticket.ticket_number}`,
        created_by: movementActorId,
      },
    });

    // 4. Update replacement unit to INSTALLED, bind to customer and installation
    await tx.inventoryUnit.update({
      where: { id: replacementUnit.id },
      data: {
        status: UnitStatus.INSTALLED,
        customer_id: ticket.customer_id,
        installation_id: ticket.installation_id || removedUnit.installation_id,
        delivered_on: today,
      },
    });

    await tx.stockMovement.create({
      data: {
        product_id: replacementUnit.product_id,
        unit_id: replacementUnit.id,
        from_location_id: replacementUnit.location_id,
        to_location_id: null,
        type: MovementType.DELIVERY,
        qty: 1,
        unit_cost_paise: replacementUnit.unit_cost_paise,
        ref_type: 'ticket',
        ref_id: ticket.id,
        reason: `Replacement installation under ticket ${ticket.ticket_number}`,
        created_by: movementActorId,
      },
    });

    // 5. Warranty Transfer Chain (ADR D5, Rule C9)
    // Find active warranty on the removed unit or use ticket's warranty
    const parentWarranty = removedUnit.warranties[0] || (ticket.warranty?.unit_id === removedUnit.id ? ticket.warranty : null);
    let newWarranty: any = null;

    if (parentWarranty) {
      // Mark parent warranty as TRANSFERRED (never deleted!)
      await tx.warranty.update({
        where: { id: parentWarranty.id },
        data: { status: WarrantyStatus.TRANSFERRED },
      });

      // Transfer logic: inherits exact original end date!
      const transferSpec = transferWarrantyToReplacement(
        {
          id: parentWarranty.id,
          endDate: parentWarranty.end_date.toISOString().split('T')[0],
          months: parentWarranty.months,
        },
        today
      );

      // Create successor warranty for replacement unit
      newWarranty = await tx.warranty.create({
        data: {
          unit_id: replacementUnit.id,
          installation_id: parentWarranty.installation_id,
          customer_id: ticket.customer_id,
          product_id: replacementUnit.product_id,
          coverage: WarrantyCoverage.EQUIPMENT,
          start_date: new Date(transferSpec.replacementStartDate),
          end_date: new Date(transferSpec.replacementEndDate), // Inherits original end date!
          months: parentWarranty.months,
          status: WarrantyStatus.ACTIVE,
          source: WarrantySource.REPLACEMENT,
          parent_warranty_id: parentWarranty.id,
        },
      });
    }

    // 6. Record TicketPart
    const isChargeable = dto.isChargeable ?? (ticket.billing_mode === BillingMode.CHARGEABLE);
    const unitPricePaise = dto.unitPricePaise !== undefined
      ? BigInt(dto.unitPricePaise)
      : (replacementUnit.product.sale_price_paise || 0n);

    const ticketPart = await tx.ticketPart.create({
      data: {
        ticket_id: ticket.id,
        product_id: replacementUnit.product_id,
        qty: 1,
        removed_unit_id: removedUnit.id,
        installed_unit_id: replacementUnit.id,
        unit_price_paise: unitPricePaise,
        chargeable: isChargeable,
      },
    });

    // 7. Update ticket reference unit and warranty
    await tx.serviceTicket.update({
      where: { id: ticket.id },
      data: {
        unit_id: replacementUnit.id,
        warranty_id: newWarranty?.id || ticket.warranty_id,
        status: TicketStatus.IN_PROGRESS,
        events: {
          create: {
            type: 'PART_REPLACED',
            from_status: ticket.status,
            to_status: TicketStatus.IN_PROGRESS,
            note: `Replaced ${removedUnit.serial_number} with ${replacementUnit.serial_number}. Warranty transferred: ${parentWarranty ? 'YES' : 'NO'}.`,
            actor_id: actorId || null,
          },
        },
      },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'TICKET_PART_REPLACED',
        after: {
          removedSerial: removedUnit.serial_number,
          installedSerial: replacementUnit.serial_number,
          chargeable: isChargeable,
          newWarrantyId: newWarranty?.id,
          transferredParentWarrantyId: parentWarranty?.id,
        },
      },
      tx
    );

    return {
      success: true,
      ticketId: ticket.id,
      ticketPartId: ticketPart.id,
      removedUnit: { id: removedUnit.id, serialNumber: removedUnit.serial_number, status: UnitStatus.RMA },
      replacementUnit: { id: replacementUnit.id, serialNumber: replacementUnit.serial_number, status: UnitStatus.INSTALLED },
      transferredWarranty: newWarranty
        ? {
            id: newWarranty.id,
            parentWarrantyId: parentWarranty?.id,
            endDate: newWarranty.end_date.toISOString().split('T')[0],
          }
        : null,
    };
  });
}

/**
 * Resolves a service ticket:
 * - If chargeable (OUT_OF_WARRANTY / EXCLUDED): auto-generates service invoice for parts and labor.
 * - If in-warranty: covered at zero charge to customer.
 * - Transitions status to RESOLVED.
 */
export async function resolveTicket(ticketId: string, dto: ResolveTicketDto, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        parts: { include: { product: true } },
      },
    });

    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
    }

    if (ticket.status === TicketStatus.CLOSED) {
      throw new AppError('TICKET_ALREADY_CLOSED', 'Closed ticket cannot be resolved directly; reopen it first.', 400);
    }

    const isChargeable = dto.isChargeable ?? (ticket.billing_mode === BillingMode.CHARGEABLE);
    let generatedInvoice: any = null;

    // Generate service invoice if chargeable
    if (isChargeable) {
      const invoiceLines: Array<{
        productId?: string;
        description: string;
        qty: number;
        unitPricePaise: bigint;
        taxRateBp: number;
      }> = [];

      // 1. Line items for chargeable parts replaced
      for (const part of ticket.parts) {
        if (part.chargeable) {
          invoiceLines.push({
            productId: part.product_id,
            description: `Replacement Part: ${part.product.name}`,
            qty: Number(part.qty),
            unitPricePaise: part.unit_price_paise,
            taxRateBp: 1800, // 18% GST standard
          });
        }
      }

      // 2. Labor / Service charges
      const laborCostPaise = dto.laborCostPaise !== undefined
        ? BigInt(dto.laborCostPaise)
        : (dto.partsCostPaise ? 0n : 150000n); // Default Rs 1,500 labor if not specified

      if (laborCostPaise > 0n) {
        invoiceLines.push({
          description: 'Technician Labor & Service Charges',
          qty: 1,
          unitPricePaise: laborCostPaise,
          taxRateBp: 1800,
        });
      }

      // If partsCostPaise was passed explicitly without parts in ticket
      if (invoiceLines.length === 0 && dto.partsCostPaise) {
        invoiceLines.push({
          description: 'Service Parts & Consumables',
          qty: 1,
          unitPricePaise: BigInt(dto.partsCostPaise),
          taxRateBp: 1800,
        });
      }

      // If still empty, ensure minimal diagnostic fee
      if (invoiceLines.length === 0) {
        invoiceLines.push({
          description: 'Diagnostic & On-site Inspection Fee',
          qty: 1,
          unitPricePaise: 100000n, // Rs 1,000
          taxRateBp: 1800,
        });
      }

      generatedInvoice = await createServiceInvoice(
        {
          ticketId: ticket.id,
          customerId: ticket.customer_id,
          lines: invoiceLines,
        },
        actorId
      );
    }

    const previousStatus = ticket.status;
    const now = new Date();

    const updated = await tx.serviceTicket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.RESOLVED,
        resolved_at: now,
        resolution_notes: dto.resolutionNotes,
        events: {
          create: {
            type: 'RESOLVED',
            from_status: previousStatus,
            to_status: TicketStatus.RESOLVED,
            note: `Resolved: ${dto.resolutionNotes}. Billing: ${isChargeable ? 'CHARGEABLE' : 'WARRANTY'}.${
              generatedInvoice ? ` Invoice: ${generatedInvoice.invoice_number}` : ''
            }`,
            actor_id: actorId || null,
          },
        },
      },
      include: {
        customer: true,
        parts: true,
        invoices: true,
      },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'SERVICE_TICKET_RESOLVED',
        after: {
          status: TicketStatus.RESOLVED,
          isChargeable,
          invoiceNumber: generatedInvoice?.invoice_number,
        },
      },
      tx
    );

    return {
      ticket: updated,
      invoice: generatedInvoice,
      isChargeable,
    };
  });
}

/**
 * Customer confirms ticket resolution, which closes the ticket.
 * Enforces CHECK constraint: chk_service_tickets_closed_needs_confirmation.
 */
export async function confirmTicketResolution(
  ticketId: string,
  dto: ConfirmTicketDto,
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
    }

    if (ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.IN_PROGRESS) {
      throw new AppError(
        'INVALID_STATE',
        `Ticket must be in RESOLVED or IN_PROGRESS status to confirm. Current: ${ticket.status}`,
        400
      );
    }

    const now = new Date();
    const method = dto.confirmationMethod || 'PORTAL';

    // Verify transition with domain rule
    const check = validateTicketTransition(
      {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        customerId: ticket.customer_id,
        channel: ticket.channel as any,
        category: ticket.category as any,
        description: ticket.description,
        priority: ticket.priority as any,
        status: ticket.status as any,
        warrantyVerdict: ticket.warranty_verdict as any,
        billingMode: ticket.billing_mode as any,
        slaDueAt: ticket.sla_due_at,
        customerConfirmedAt: now, // Confirmation provided
        reopenCount: ticket.reopen_count,
        warrantyId: ticket.warranty_id,
      },
      'CLOSED'
    );

    if (!check.valid) {
      throw new AppError('TRANSITION_REJECTED', check.reason || 'Cannot close ticket', 400);
    }

    const updated = await tx.serviceTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.CLOSED,
        customer_confirmed_at: now,
        confirmation_method: method,
        closed_at: now,
        events: {
          create: {
            type: 'CLOSED',
            from_status: ticket.status,
            to_status: TicketStatus.CLOSED,
            note: `Customer confirmed resolution via ${method}.${dto.customerFeedback ? ` Feedback: "${dto.customerFeedback}"` : ''}`,
            actor_id: actorId || null,
          },
        },
      },
      include: { customer: true },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'SERVICE_TICKET_CLOSED',
        after: {
          status: TicketStatus.CLOSED,
          confirmedAt: now.toISOString(),
          confirmationMethod: method,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Reopens a ticket from RESOLVED or CLOSED back to IN_PROGRESS.
 */
export async function reopenTicket(ticketId: string, dto: ReopenTicketDto, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
    }

    if (ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.CLOSED) {
      throw new AppError(
        'INVALID_REOPEN_STATE',
        `Can only reopen tickets that are RESOLVED or CLOSED. Current status: ${ticket.status}`,
        400
      );
    }

    const updated = await tx.serviceTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.IN_PROGRESS,
        reopen_count: ticket.reopen_count + 1,
        resolved_at: null,
        closed_at: null,
        events: {
          create: {
            type: 'REOPENED',
            from_status: ticket.status,
            to_status: TicketStatus.IN_PROGRESS,
            note: `Reopened (Attempt #${ticket.reopen_count + 1}): ${dto.reason}`,
            actor_id: actorId || null,
          },
        },
      },
      include: { customer: true },
    });

    await recordAudit(
      {
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'SERVICE_TICKET_REOPENED',
        after: {
          reopenCount: updated.reopen_count,
          reason: dto.reason,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Excludes a ticket / unit warranty with director approval.
 */
export async function excludeTicketWarranty(ticketId: string, dto: ExcludeWarrantyDto, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({
      where: { id: ticketId },
      include: { warranty: true },
    });

    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
    }

    // Void the warranty record if linked
    if (ticket.warranty_id) {
      await tx.warranty.update({
        where: { id: ticket.warranty_id },
        data: {
          status: WarrantyStatus.VOID,
          void_reason: dto.reason,
          voided_by: actorId,
        },
      });
    }

    const updated = await tx.serviceTicket.update({
      where: { id: ticket.id },
      data: {
        warranty_verdict: WarrantyVerdict.EXCLUDED,
        billing_mode: BillingMode.CHARGEABLE,
        events: {
          create: {
            type: 'WARRANTY_EXCLUDED',
            note: `Warranty voided / excluded: ${dto.reason}`,
            actor_id: actorId,
          },
        },
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'SERVICE_TICKET',
        entityId: ticket.id,
        action: 'WARRANTY_EXCLUDED',
        after: {
          reason: dto.reason,
          verdict: WarrantyVerdict.EXCLUDED,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Retrieves a single service ticket by ID or ticket number with full relations.
 */
export async function getTicket(ticketIdOrNumber: string) {
  const ticket = await prisma.serviceTicket.findFirst({
    where: {
      OR: [
        { id: ticketIdOrNumber.includes('-') && ticketIdOrNumber.length === 36 ? ticketIdOrNumber : undefined },
        { ticket_number: ticketIdOrNumber },
      ].filter(Boolean) as any,
    },
    include: {
      customer: true,
      unit: { include: { product: true } },
      warranty: true,
      assignee: { select: { id: true, name: true, phone: true } },
      parts: {
        include: {
          product: true,
          removed_unit: true,
          installed_unit: true,
        },
      },
      events: {
        include: { actor: { select: { id: true, name: true, role: true } } },
        orderBy: { created_at: 'asc' },
      },
      invoices: {
        include: { lines: true },
      },
    },
  });

  if (!ticket) {
    throw new AppError('TICKET_NOT_FOUND', 'Service ticket not found', 404);
  }

  return ticket;
}
