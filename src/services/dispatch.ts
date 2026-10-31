/**
 * SunPower Ops - Dispatch Domain Service (TRD 2.4, Spec 6.3 Phase 5, ADR D3, D4, D5)
 * Warehouse picking & camera QR/barcode scanning, scan rules & validation,
 * departure gate with trigger guard, reservation consumption, delivery confirmation,
 * and automated equipment warranty initialization.
 */

import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { calculateWarrantyPeriod } from '@/domain/warranty';
import {
  DispatchStatus,
  UnitStatus,
  MovementType,
  OrderStatus,
  ScanMethod,
  WarrantyCoverage,
  WarrantyStatus,
  WarrantySource,
  WarrantyStartBasis,
} from '@prisma/client';

export interface ScanUnitInput {
  dispatchId: string;
  unitCode: string; // Serial number or QR code string
  scannedBy?: string;
  method?: 'QR' | 'BARCODE' | 'MANUAL';
}

export interface DepartDispatchInput {
  dispatchId: string;
  actorId?: string;
  departedAt?: string | Date;
}

export interface DeliverDispatchInput {
  dispatchId: string;
  actorId?: string;
  deliveredAt?: string | Date;
  deliveredLat?: number;
  deliveredLng?: number;
}

/**
 * Retrieves full dispatch record with lines, loaded quantities, and scanned serial numbers.
 */
export async function getDispatch(id: string) {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          customer: true,
          installation: true,
        },
      },
      from_location: true,
      vehicle_location: true,
      lines: {
        include: {
          product: true,
          units: {
            where: { removed_at: null },
            include: {
              unit: true,
            },
          },
        },
      },
    },
  });

  if (!dispatch) {
    throw new AppError('NOT_FOUND', 'Dispatch record not found', 404);
  }

  const isFullyLoaded = dispatch.lines.every(
    (l) => Number(l.qty_loaded) >= Number(l.qty_required)
  );

  return {
    id: dispatch.id,
    dispatchNumber: dispatch.dispatch_number,
    orderId: dispatch.order_id,
    orderNumber: dispatch.order.order_number,
    customerName: dispatch.order.customer.name,
    customerPhone: dispatch.order.customer.phone,
    status: dispatch.status,
    fromLocationName: dispatch.from_location.name,
    scheduledOn: dispatch.scheduled_on.toISOString().split('T')[0],
    departedAt: dispatch.departed_at ? dispatch.departed_at.toISOString() : null,
    deliveredAt: dispatch.delivered_at ? dispatch.delivered_at.toISOString() : null,
    isFullyLoaded,
    lines: dispatch.lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product.name,
      productSku: l.product.sku,
      isSerialized: l.product.is_serialized,
      qtyRequired: Number(l.qty_required),
      qtyLoaded: Number(l.qty_loaded),
      scannedUnits: l.units.map((u) => ({
        dispatchUnitId: u.id,
        unitId: u.unit.id,
        serialNumber: u.unit.serial_number,
        qrCode: u.unit.qr_code,
        scannedAt: u.scanned_at.toISOString(),
      })),
    })),
  };
}

/**
 * Scans a physical unit onto a dispatch line.
 * Enforces:
 * - Unit exists and is IN_STOCK
 * - Unit product matches a dispatch line (WRONG_PRODUCT if mismatched)
 * - Unit is not already scanned on this or any active dispatch (ALREADY_SCANNED)
 * - Line is not already fulfilled (LINE_ALREADY_FULFILLED)
 */
export async function scanDispatchUnit(input: ScanUnitInput) {
  const code = input.unitCode?.trim().toUpperCase();
  if (!code) {
    throw new AppError('VALIDATION_FAILED', 'Serial number or QR code is required', 400);
  }

  let actorId = input.scannedBy;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Fetch dispatch
    const dispatch = await tx.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: {
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!dispatch) {
      throw new AppError('NOT_FOUND', 'Dispatch record not found', 404);
    }

    if (dispatch.status !== DispatchStatus.PICKING && dispatch.status !== DispatchStatus.READY) {
      throw new AppError('INVALID_STATE', `Cannot scan units onto dispatch in ${dispatch.status} status`, 400);
    }

    // 2. Find unit by QR code or serial number
    const unit = await tx.inventoryUnit.findFirst({
      where: {
        OR: [
          { qr_code: code },
          { serial_number: code },
        ],
      },
      include: {
        product: true,
      },
    });

    if (!unit) {
      throw new AppError('NOT_FOUND', `Inventory unit with code '${code}' not found`, 404);
    }

    if (unit.status !== UnitStatus.IN_STOCK) {
      throw new AppError(
        'UNIT_NOT_AVAILABLE',
        `Unit ${unit.serial_number} is not in stock (current status: ${unit.status})`,
        400
      );
    }

    // 3. Find matching dispatch line for this product
    const matchingLine = dispatch.lines.find((l) => l.product_id === unit.product_id);
    if (!matchingLine) {
      throw new AppError(
        'WRONG_PRODUCT',
        `Scanned unit (${unit.product.name}, SKU ${unit.product.sku}) does not match any item on this dispatch`,
        400
      );
    }

    // 4. Check if already scanned on this dispatch
    const alreadyScanned = await tx.dispatchUnit.findFirst({
      where: {
        dispatch_id: dispatch.id,
        unit_id: unit.id,
        removed_at: null,
      },
    });
    if (alreadyScanned) {
      throw new AppError(
        'ALREADY_SCANNED',
        `Unit ${unit.serial_number} has already been scanned onto this dispatch`,
        409
      );
    }

    // 5. Check if line is already fulfilled
    if (Number(matchingLine.qty_loaded) >= Number(matchingLine.qty_required)) {
      throw new AppError(
        'LINE_ALREADY_FULFILLED',
        `All ${matchingLine.qty_required} required units of ${matchingLine.product.name} are already scanned`,
        400
      );
    }

    // 6. Record scan
    const scanMethod = (input.method as ScanMethod) || ScanMethod.QR;
    const dispatchUnit = await tx.dispatchUnit.create({
      data: {
        dispatch_id: dispatch.id,
        dispatch_line_id: matchingLine.id,
        unit_id: unit.id,
        method: scanMethod,
        scanned_by: actorId!,
      },
    });

    // Increment loaded quantity
    const updatedLine = await tx.dispatchLine.update({
      where: { id: matchingLine.id },
      data: {
        qty_loaded: { increment: 1 },
      },
    });

    // Mark unit as PICKED
    await tx.inventoryUnit.update({
      where: { id: unit.id },
      data: { status: UnitStatus.PICKED },
    });

    // Check if dispatch is now completely loaded
    const allLines = await tx.dispatchLine.findMany({
      where: { dispatch_id: dispatch.id },
    });
    const allFulfilled = allLines.every((l) => Number(l.qty_loaded) >= Number(l.qty_required));
    if (allFulfilled && dispatch.status === DispatchStatus.PICKING) {
      await tx.dispatch.update({
        where: { id: dispatch.id },
        data: { status: DispatchStatus.READY },
      });
    }

    // Audit log
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'DISPATCH',
        entityId: dispatch.id,
        action: 'UNIT_SCANNED',
        after: {
          serialNumber: unit.serial_number,
          productId: unit.product_id,
          lineId: matchingLine.id,
          qtyLoaded: Number(updatedLine.qty_loaded),
          qtyRequired: Number(matchingLine.qty_required),
        },
      },
      tx
    );

    return {
      dispatchUnitId: dispatchUnit.id,
      unitId: unit.id,
      serialNumber: unit.serial_number,
      productId: unit.product_id,
      productName: unit.product.name,
      qtyLoaded: Number(updatedLine.qty_loaded),
      qtyRequired: Number(matchingLine.qty_required),
      isDispatchReady: allFulfilled,
    };
  });
}

/**
 * Removes a scanned unit from picking before departure.
 */
export async function unscanDispatchUnit(data: {
  dispatchId: string;
  unitId: string;
  actorId?: string;
}) {
  let actorId = data.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.findUnique({
      where: { id: data.dispatchId },
    });
    if (!dispatch) {
      throw new AppError('NOT_FOUND', 'Dispatch not found', 404);
    }
    if (dispatch.status !== DispatchStatus.PICKING && dispatch.status !== DispatchStatus.READY) {
      throw new AppError('INVALID_STATE', 'Cannot unscan units after dispatch has departed', 400);
    }

    const dispatchUnit = await tx.dispatchUnit.findFirst({
      where: {
        dispatch_id: data.dispatchId,
        unit_id: data.unitId,
        removed_at: null,
      },
    });
    if (!dispatchUnit) {
      throw new AppError('NOT_FOUND', 'Scanned unit record not found on this dispatch', 404);
    }

    // Decrement loaded qty on line
    await tx.dispatchLine.update({
      where: { id: dispatchUnit.dispatch_line_id },
      data: {
        qty_loaded: { decrement: 1 },
      },
    });

    // Reset unit status
    await tx.inventoryUnit.update({
      where: { id: data.unitId },
      data: { status: UnitStatus.IN_STOCK },
    });

    // Delete or mark removed
    await tx.dispatchUnit.delete({
      where: { id: dispatchUnit.id },
    });

    // Reset dispatch status back to PICKING if it was READY
    await tx.dispatch.update({
      where: { id: data.dispatchId },
      data: { status: DispatchStatus.PICKING },
    });

    // Audit log
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'DISPATCH',
        entityId: data.dispatchId,
        action: 'UNIT_UNSCANNED',
        after: { unitId: data.unitId },
      },
      tx
    );

    return { success: true };
  });
}

/**
 * Gate check & departure:
 * - Refuses departure if any line is incomplete (DISPATCH_INCOMPLETE)
 * - Transitions status to IN_TRANSIT
 * - Consumes reserved quantities and records DISPATCH stock movements
 * - Marks units DISPATCHED
 */
export async function departDispatch(input: DepartDispatchInput) {
  let actorId = input.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  const departedAt = input.departedAt ? new Date(input.departedAt) : new Date();

  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: {
        order: true,
        lines: {
          include: {
            product: true,
            units: {
              where: { removed_at: null },
              include: { unit: true },
            },
          },
        },
      },
    });

    if (!dispatch) {
      throw new AppError('NOT_FOUND', 'Dispatch not found', 404);
    }

    if (dispatch.status !== DispatchStatus.PICKING && dispatch.status !== DispatchStatus.READY) {
      throw new AppError('INVALID_STATE', `Dispatch is already ${dispatch.status}`, 400);
    }

    // Departure Gate Check: every line must be fully loaded
    for (const line of dispatch.lines) {
      if (Number(line.qty_loaded) < Number(line.qty_required)) {
        throw new AppError(
          'DISPATCH_INCOMPLETE',
          `Cannot depart dispatch: item ${line.product.name} is incomplete (${line.qty_loaded}/${line.qty_required} loaded)`,
          400
        );
      }
    }

    // 1. Consume reservations & update stock_levels (on_hand -= qty, reserved -= qty)
    for (const line of dispatch.lines) {
      const lineQty = Number(line.qty_required);

      const stockLevel = await tx.stockLevel.findUnique({
        where: {
          product_id_location_id: {
            product_id: line.product_id,
            location_id: dispatch.from_location_id,
          },
        },
      });

      const avgCostPaise = stockLevel?.avg_cost_paise || 0n;

      if (stockLevel) {
        await tx.stockLevel.update({
          where: {
            product_id_location_id: {
              product_id: line.product_id,
              location_id: dispatch.from_location_id,
            },
          },
          data: {
            on_hand: { decrement: lineQty },
            reserved: { decrement: lineQty },
          },
        });
      }

      // Record DISPATCH stock movement
      await tx.stockMovement.create({
        data: {
          product_id: line.product_id,
          qty: lineQty,
          from_location_id: dispatch.from_location_id,
          to_location_id: dispatch.vehicle_location_id || null,
          type: MovementType.DISPATCH,
          unit_cost_paise: avgCostPaise,
          ref_type: 'dispatch',
          ref_id: dispatch.id,
          reason: `Dispatch ${dispatch.dispatch_number} departure`,
          created_by: actorId!,
        },
      });

      // Update OrderLine dispatched quantity
      await tx.orderLine.update({
        where: { id: line.order_line_id },
        data: {
          qty_dispatched: { increment: lineQty },
          qty_reserved: { decrement: lineQty },
        },
      });

      // Update units to DISPATCHED
      for (const du of line.units) {
        await tx.inventoryUnit.update({
          where: { id: du.unit_id },
          data: {
            status: UnitStatus.DISPATCHED,
            order_id: dispatch.order_id,
          },
        });
      }
    }

    // 2. Update dispatch status to IN_TRANSIT
    const updatedDispatch = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: DispatchStatus.IN_TRANSIT,
        departed_at: departedAt,
      },
    });

    // 3. Update order status to IN_TRANSIT or DISPATCHED
    await tx.order.update({
      where: { id: dispatch.order_id },
      data: {
        status: OrderStatus.DISPATCHED,
      },
    });

    // Audit log
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'DISPATCH',
        entityId: dispatch.id,
        action: 'DISPATCH_DEPARTED',
        after: {
          dispatchNumber: dispatch.dispatch_number,
          departedAt: departedAt.toISOString(),
          status: DispatchStatus.IN_TRANSIT,
        },
      },
      tx
    );

    return {
      dispatchId: updatedDispatch.id,
      dispatchNumber: updatedDispatch.dispatch_number,
      status: updatedDispatch.status,
      departedAt: updatedDispatch.departed_at?.toISOString(),
    };
  });
}

/**
 * Confirms delivery at project site:
 * - Sets dispatch status to DELIVERED
 * - Assigns units to customer and records delivery date
 * - Automatically creates equipment warranties for units with DELIVERY start basis
 */
export async function deliverDispatch(input: DeliverDispatchInput) {
  let actorId = input.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  const deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : new Date();
  const deliveryDateStr = deliveredAt.toISOString().split('T')[0];

  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: {
        order: {
          include: {
            customer: true,
            installation: true,
          },
        },
        lines: {
          include: {
            product: true,
            units: {
              where: { removed_at: null },
              include: { unit: true },
            },
          },
        },
      },
    });

    if (!dispatch) {
      throw new AppError('NOT_FOUND', 'Dispatch not found', 404);
    }

    if (dispatch.status !== DispatchStatus.IN_TRANSIT) {
      throw new AppError('INVALID_STATE', `Only dispatches in IN_TRANSIT status can be marked delivered`, 400);
    }

    // Ensure installation shell exists for linking warranties
    let installationId = dispatch.order.installation?.id;
    if (!installationId) {
      const inst = await tx.installation.create({
        data: {
          order_id: dispatch.order_id,
          scheduled_on: deliveredAt,
        },
      });
      installationId = inst.id;
    }

    const createdWarranties: Array<{
      id: string;
      unitId: string;
      serialNumber: string;
      startDate: string;
      endDate: string;
    }> = [];

    // 1. Process all scanned units onto customer & warranties
    for (const line of dispatch.lines) {
      const product = line.product;

      for (const du of line.units) {
        const unit = du.unit;

        // Update unit: DELIVERED, bind customer, set delivered_on
        await tx.inventoryUnit.update({
          where: { id: unit.id },
          data: {
            status: UnitStatus.DELIVERED,
            customer_id: dispatch.order.customer_id,
            delivered_on: deliveredAt,
            installation_id: installationId,
          },
        });

        // Record DELIVERY stock movement
        await tx.stockMovement.create({
          data: {
            product_id: unit.product_id,
            unit_id: unit.id,
            qty: 1,
            from_location_id: dispatch.vehicle_location_id || null,
            type: MovementType.DELIVERY,
            unit_cost_paise: unit.unit_cost_paise,
            ref_type: 'dispatch',
            ref_id: dispatch.id,
            reason: `Delivered to customer ${dispatch.order.customer.name}`,
            created_by: actorId!,
          },
        });

        // 2. Create warranty if product start basis is DELIVERY
        if (product.warranty_months > 0 && product.warranty_start_basis === WarrantyStartBasis.DELIVERY) {
          const { startDate, endDate, months } = calculateWarrantyPeriod({
            startBasis: 'DELIVERY',
            deliveryDate: deliveryDateStr,
            months: product.warranty_months,
          });

          const warranty = await tx.warranty.create({
            data: {
              unit_id: unit.id,
              installation_id: installationId,
              customer_id: dispatch.order.customer_id,
              product_id: unit.product_id,
              coverage: WarrantyCoverage.EQUIPMENT,
              start_date: new Date(startDate),
              end_date: new Date(endDate),
              months,
              status: WarrantyStatus.ACTIVE,
              source: WarrantySource.DELIVERY,
            },
          });

          createdWarranties.push({
            id: warranty.id,
            unitId: unit.id,
            serialNumber: unit.serial_number,
            startDate,
            endDate,
          });
        }
      }
    }

    // 3. Update dispatch status to DELIVERED
    const updatedDispatch = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: DispatchStatus.DELIVERED,
        delivered_at: deliveredAt,
        delivered_lat: input.deliveredLat || null,
        delivered_lng: input.deliveredLng || null,
      },
    });

    // 4. Update order status
    await tx.order.update({
      where: { id: dispatch.order_id },
      data: {
        status: OrderStatus.DELIVERED,
      },
    });

    // Audit log
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'DISPATCH',
        entityId: dispatch.id,
        action: 'DISPATCH_DELIVERED',
        after: {
          dispatchNumber: dispatch.dispatch_number,
          deliveredAt: deliveredAt.toISOString(),
          warrantiesCreated: createdWarranties.length,
        },
      },
      tx
    );

    return {
      dispatchId: updatedDispatch.id,
      dispatchNumber: updatedDispatch.dispatch_number,
      status: updatedDispatch.status,
      deliveredAt: updatedDispatch.delivered_at?.toISOString(),
      warranties: createdWarranties,
    };
  });
}

