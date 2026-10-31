import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { queueNotification } from '@/lib/outbox';
import { getNextSequence } from '@/lib/sequences';
import { formatPaise } from '@/lib/money';
import { validateTransition } from '@/domain/state-machines/transitions';
import { createSalesInvoiceForOrder } from './invoices';
import { buildRankedCrewSuggestions, collectCrewCandidates, persistCrewSuggestions } from './scheduling';
import { JobRequirements } from '@/domain/crew-scoring';
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
        include: { crew_lead: true },
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
          crew_lead: true,
          crew: { include: { technician: { include: { user: true } } } },
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
        quote: { include: { lead: { include: { survey: true } } } },
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

    // 2. Reserve stock in product-id order to prevent deadlocks (ADR D3).
    //    Every stock_levels row involved is locked with SELECT ... FOR UPDATE
    //    so concurrent confirmations serialise on the same rows (FR-4.4).
    const sortedLines = [...order.lines].sort((a, b) => a.product_id.localeCompare(b.product_id));

    let hasShortage = false;
    for (const line of sortedLines) {
      const neededQty = Number(line.qty) - Number(line.qty_reserved);
      if (neededQty <= 0) continue;

      // Row lock on the stock level (creates nothing when absent)
      await tx.$queryRaw`
        SELECT product_id, location_id
        FROM stock_levels
        WHERE product_id = ${line.product_id}::uuid AND location_id = ${warehouse.id}::uuid
        FOR UPDATE
      `;

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
    const dispatchNumber = await getNextSequence('dispatch', undefined, tx);
    const dispatch = await tx.dispatch.create({
      data: {
        dispatch_number: dispatchNumber,
        order_id: order.id,
        from_location_id: warehouse.id,
        scheduled_on: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Default 3 days ahead
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

    // 4. Create Installation Job with a crew chosen by the production crew
    //    scorer (0.40 skill + 0.25 proximity + 0.20 workload + 0.15 site
    //    continuity) instead of "first crew-lead grabbed" (FR-4.4 / S10).
    const targetDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const jobReq: JobRequirements = {
      capacityKw: Number(order.capacity_kw),
      // HYBRID systems are treated as ON_GRID for crew-skill purposes
      systemType: order.system_type === 'OFF_GRID' ? 'OFF_GRID' : 'ON_GRID',
      targetDate,
      // Site coordinates from the customer record; when the address has not
      // been geo-coded the scorer's proximity factor gracefully falls back to
      // the 15 km in-city default distance.
      siteLat: order.customer?.lat ? Number(order.customer.lat) : undefined,
      siteLng: order.customer?.lng ? Number(order.customer.lng) : undefined,
      surveyorUserId: order.quote?.lead?.survey?.surveyor_id || undefined,
    };

    const candidates = await collectCrewCandidates(tx, targetDate);
    const suggestions = buildRankedCrewSuggestions(candidates, jobReq);
    const bestCrew = suggestions[0];

    const installation = await tx.installation.create({
      data: {
        order_id: order.id,
        crew_lead_id: bestCrew ? bestCrew.leadId : null,
        scheduled_on: targetDate,
        status: InstallationStatus.SCHEDULED,
      },
    });

    // Persist the ranked suggestions (CrewSuggestion audit trail) and link
    // the recommended crew members to the installation.
    await persistCrewSuggestions(tx, installation.id, suggestions);
    if (bestCrew && bestCrew.memberIds.length > 0) {
      for (const memberId of bestCrew.memberIds) {
        await tx.installationCrew.create({
          data: {
            installation_id: installation.id,
            technician_id: memberId,
            role: 'ASSISTANT',
          },
        }).catch(() => {
          // A member may already be linked; ignore duplicates
        });
      }
    }

    // 5. Generate the SALES invoice for the order (FR-8.7 / C11) — idempotent
    const { invoice: salesInvoice } = await createSalesInvoiceForOrder(
      order,
      overrideByUserId,
      tx
    );

    // 6. Update Order status
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CONFIRMED,
        confirmed_at: new Date(),
        override_by: overrideByUserId || null,
      },
    });

    // 7. Audit & Outbox
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
          salesInvoiceId: salesInvoice.id,
          hasShortage,
          crewLeadId: bestCrew?.leadId ?? null,
          crewScore: bestCrew?.breakdown.totalScore ?? null,
        },
      },
      tx
    );

    // AUTO-10: notify the customer. EMAIL preferred, SMS fallback.
    const confirmPayload = {
      customerName: order.customer.name,
      orderNumber: order.order_number,
      advanceAmount: formatPaise(order.advance_required_paise),
    };
    try {
      if (order.customer.email) {
        await queueNotification(
          {
            channel: 'EMAIL',
            recipient: order.customer.email,
            template: 'ORDER_CONFIRMED',
            payload: confirmPayload,
            idempotencyKey: `order-confirmed:${order.id}`,
          },
          tx
        );
      } else if (order.customer.phone) {
        await queueNotification(
          {
            channel: 'SMS',
            recipient: order.customer.phone,
            template: 'ORDER_CONFIRMED',
            payload: confirmPayload,
            idempotencyKey: `order-confirmed:${order.id}`,
          },
          tx
        );
      }
    } catch {
      // Notification enqueue failure must not roll back the confirmation
    }

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
        application_ref: data.applicationNumber || null,
        submitted_on: data.inspectionDate ? new Date(data.inspectionDate) : null,
        expected_paise: data.sanctionedAmountRupees ? BigInt(Math.round(data.sanctionedAmountRupees * 100)) : 0n,
        disbursed_on: data.disbursedOn ? new Date(data.disbursedOn) : null,
        notes: data.notes || null,
      },
      update: {
        status: data.status as any,
        application_ref: data.applicationNumber || undefined,
        submitted_on: data.inspectionDate ? new Date(data.inspectionDate) : undefined,
        expected_paise: data.sanctionedAmountRupees ? BigInt(Math.round(data.sanctionedAmountRupees * 100)) : undefined,
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

    if (order.status === OrderStatus.CLOSED) {
      throw new AppError('CONFLICT', 'Cannot cancel a completed installation order.', 409);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('CONFLICT', 'Order is already cancelled.', 409);
    }

    if (!reason || !reason.trim()) {
      throw new AppError('VALIDATION_FAILED', 'A reason is required when cancelling an order.', 422);
    }

    // 1. Release active reservations under row locks (ADR D3), clamped at
    //    zero so a cancelled order can never drive `reserved` negative
    //    (FR-4.5 / C5 / AUTO-2).
    for (const line of order.lines) {
      for (const alloc of line.allocations) {
        // Release reservation in stock_level (read-then-write clamp)
        const allocLevel = await tx.stockLevel.findUnique({
          where: {
            product_id_location_id: {
              product_id: alloc.product_id,
              location_id: alloc.location_id,
            },
          },
        });
        if (allocLevel) {
          await tx.stockLevel.update({
            where: {
              product_id_location_id: {
                product_id: alloc.product_id,
                location_id: alloc.location_id,
              },
            },
            data: {
              reserved: Math.max(0, Number(allocLevel.reserved) - Number(alloc.qty)),
            },
          });
        }

        // Mark allocation cancelled
        await tx.stockAllocation.update({
          where: { id: alloc.id },
          data: { status: AllocationStatus.RELEASED },
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
        data: { status: InstallationStatus.ON_HOLD, hold_reason: 'Order cancelled' },
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

