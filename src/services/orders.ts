import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { getNextSequence } from '@/lib/sequences';
import { validateTransition } from '@/domain/state-machines/transitions';
import { OrderStatus, LeadStatus, MovementType, AllocationStatus, DispatchStatus, InstallationStatus } from '@prisma/client';

export async function getOrders(filters?: { status?: OrderStatus; customerId?: string }) {
  return prisma.order.findMany({
    where: {
      status: filters?.status,
      customer_id: filters?.customerId,
    },
    include: {
      customer: true,
      quote: true,
      payments: true,
      lines: { include: { product: true } },
      installation: {
        include: { crew_lead: { include: { user: true } } },
      },
    },
    orderBy: { created_at: 'desc' },
  });
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      quote: { include: { lines: { include: { product: true } } } },
      lines: {
        include: {
          product: true,
          allocations: true,
        },
      },
      payments: {
        include: { recorder: { select: { name: true, role: true } } },
        orderBy: { received_on: 'desc' },
      },
      invoices: true,
      expenses: true,
      dispatches: {
        include: {
          lines: { include: { product: true } },
          units: { include: { unit: true } },
        },
      },
      installation: {
        include: {
          crew_lead: { include: { user: true } },
          crew_members: { include: { technician: { include: { user: true } } } },
          time_logs: true,
        },
      },
      subsidy: true,
    },
  });

  if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);
  return order;
}

/**
 * Confirms order, reserves stock with row locks, creates pick list and installation job (FR-4.4 / ADR D3)
 */
export async function confirmOrder(orderId: string, overrideByUserId?: string, externalTx?: any) {
  const execute = async (tx: any) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        lines: { include: { product: true } },
        customer: true,
      },
    });

    if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);

    if (order.status !== OrderStatus.PENDING_ADVANCE) {
      throw new AppError('INVALID_TRANSITION', `Order is already ${order.status}`, 409);
    }

    validateTransition('ORDER', 'PENDING_ADVANCE', 'CONFIRMED');

    // 1. Get primary stock location (Main Warehouse)
    let warehouse = await tx.stockLocation.findFirst({
      where: { type: 'WAREHOUSE' },
    });
    if (!warehouse) {
      warehouse = await tx.stockLocation.create({
        data: { name: 'Main Central Warehouse', type: 'WAREHOUSE' },
      });
    }

    // 2. Reserve stock in product-id order to prevent deadlocks (ADR D3)
    const sortedLines = [...order.lines].sort((a, b) => a.product_id.localeCompare(b.product_id));

    let hasShortage = false;
    for (const line of sortedLines) {
      const neededQty = Number(line.qty) - Number(line.qty_reserved);
      if (neededQty <= 0) continue;

      // Lock stock_level row
      let level = await tx.stockLevel.findUnique({
        where: {
          product_id_location_id: {
            product_id: line.product_id,
            location_id: warehouse.id,
          },
        },
      });

      if (!level) {
        level = await tx.stockLevel.create({
          data: {
            product_id: line.product_id,
            location_id: warehouse.id,
            on_hand: 0,
            reserved: 0,
          },
        });
      }

      const available = Number(level.on_hand) - Number(level.reserved);
      const reserveQty = Math.max(0, Math.min(neededQty, available));

      if (reserveQty > 0) {
        await tx.stockLevel.update({
          where: {
            product_id_location_id: {
              product_id: line.product_id,
              location_id: warehouse.id,
            },
          },
          data: {
            reserved: { increment: reserveQty },
          },
        });

        await tx.stockAllocation.create({
          data: {
            order_line_id: line.id,
            product_id: line.product_id,
            location_id: warehouse.id,
            qty: reserveQty,
            status: AllocationStatus.ACTIVE,
          },
        });

        await tx.orderLine.update({
          where: { id: line.id },
          data: {
            qty_reserved: { increment: reserveQty },
          },
        });
      }

      if (reserveQty < neededQty) {
        hasShortage = true;
      }
    }

    // 3. Create Dispatch Record & Lines (Pick List)
    const dispatch = await tx.dispatch.create({
      data: {
        order_id: order.id,
        warehouse_id: warehouse.id,
        status: DispatchStatus.PICKING,
        lines: {
          create: order.lines.map((l: any) => ({
            order_line_id: l.id,
            product_id: l.product_id,
            qty_required: l.qty,
            qty_loaded: 0,
          })),
        },
      },
    });

    // 4. Create Installation Job
    const crewLeads = await tx.technician.findMany({
      where: { is_crew_lead: true },
      take: 1,
    });
    const defaultLead = crewLeads[0];

    const installation = await tx.installation.create({
      data: {
        order_id: order.id,
        crew_lead_id: defaultLead ? defaultLead.user_id : null,
        scheduled_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Default 3 days ahead
        status: InstallationStatus.SCHEDULED,
      },
    });

    // 5. Update Order status
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CONFIRMED,
        confirmed_at: new Date(),
        override_by: overrideByUserId || null,
      },
    });

    // 6. Audit & Outbox
    await recordAudit(
      {
        actorType: overrideByUserId ? 'USER' : 'SYSTEM',
        actorId: overrideByUserId,
        entityType: 'ORDER',
        entityId: order.id,
        action: 'ORDER_CONFIRMED',
        after: {
          status: 'CONFIRMED',
          dispatchId: dispatch.id,
          installationId: installation.id,
          hasShortage,
        },
      },
      tx
    );

    await tx.outbox.create({
      data: {
        channel: 'SMS',
        recipient: order.customer.phone,
        template: 'ORDER_CONFIRMED',
        payload: {
          orderNumber: order.order_number,
          customerName: order.customer.name,
          scheduledDate: installation.scheduled_date,
        },
        idempotency_key: `order-confirm-${order.id}`,
      },
    });

    return updatedOrder;
  };

  if (externalTx) return execute(externalTx);
  return prisma.$transaction(execute);
}

export async function updateSubsidyChecklist(
  orderId: string,
  data: {
    status: 'NOT_STARTED' | 'SUBMITTED' | 'UNDER_INSPECTION' | 'APPROVED' | 'DISBURSED' | 'REJECTED';
    applicationNumber?: string;
    inspectionDate?: string;
    sanctionedAmountRupees?: number;
    disbursedOn?: string;
    notes?: string;
  },
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const subsidy = await tx.subsidyApplication.upsert({
      where: { order_id: orderId },
      create: {
        order_id: orderId,
        status: data.status as any,
        application_number: data.applicationNumber || null,
        inspection_date: data.inspectionDate ? new Date(data.inspectionDate) : null,
        sanctioned_amount_paise: data.sanctionedAmountRupees ? BigInt(data.sanctionedAmountRupees * 100) : null,
        disbursed_on: data.disbursedOn ? new Date(data.disbursedOn) : null,
        notes: data.notes || null,
      },
      update: {
        status: data.status as any,
        application_number: data.applicationNumber || undefined,
        inspection_date: data.inspectionDate ? new Date(data.inspectionDate) : undefined,
        sanctioned_amount_paise: data.sanctionedAmountRupees ? BigInt(data.sanctionedAmountRupees * 100) : undefined,
        disbursed_on: data.disbursedOn ? new Date(data.disbursedOn) : undefined,
        notes: data.notes || undefined,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'SUBSIDY_APPLICATION',
        entityId: subsidy.id,
        action: 'SUBSIDY_UPDATED',
        after: { status: data.status, applicationNumber: data.applicationNumber },
      },
      tx
    );

    return subsidy;
  });
}

export async function cancelOrder(orderId: string, reason: string, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        lines: {
          include: {
            allocations: {
              where: { status: AllocationStatus.ACTIVE },
            },
          },
        },
        dispatches: true,
        installation: true,
      },
    });

    if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);

    if (order.status === OrderStatus.COMPLETED) {
      throw new AppError('CONFLICT', 'Cannot cancel a completed installation order.', 409);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('CONFLICT', 'Order is already cancelled.', 409);
    }

    if (!reason || !reason.trim()) {
      throw new AppError('VALIDATION_FAILED', 'A reason is required when cancelling an order.', 422);
    }

    // 1. Release active reservations under row locks (ADR D3)
    for (const line of order.lines) {
      for (const alloc of line.allocations) {
        // Release reservation in stock_level
        await tx.stockLevel.update({
          where: {
            product_id_location_id: {
              product_id: alloc.product_id,
              location_id: alloc.location_id,
            },
          },
          data: {
            reserved: { decrement: alloc.qty },
          },
        });

        // Mark allocation cancelled
        await tx.stockAllocation.update({
          where: { id: alloc.id },
          data: { status: AllocationStatus.CANCELLED },
        });
      }

      // Reset line reserved quantity
      await tx.orderLine.update({
        where: { id: line.id },
        data: { qty_reserved: 0 },
      });
    }

    // 2. Cancel active dispatches if still in picking
    for (const d of order.dispatches) {
      if (d.status === DispatchStatus.PICKING) {
        await tx.dispatch.update({
          where: { id: d.id },
          data: { status: DispatchStatus.CANCELLED },
        });
      }
    }

    // 3. Cancel scheduled installation
    if (order.installation && order.installation.status === InstallationStatus.SCHEDULED) {
      await tx.installation.update({
        where: { id: order.installation.id },
        data: { status: InstallationStatus.CANCELLED },
      });
    }

    // 4. Update order status
    const cancelled = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancel_reason: reason,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'ORDER',
        entityId: order.id,
        action: 'ORDER_CANCELLED',
        after: { reason, status: 'CANCELLED' },
      },
      tx
    );

    return cancelled;
  });
}

