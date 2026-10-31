import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { POStatus, MovementType, UnitStatus } from '@prisma/client';
import { notifyLowStock } from './inventory';
import { randomBytes } from 'crypto';

export async function listSuppliers() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
  });

  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    contact: s.contact || '',
    phone: s.phone || '',
    email: s.email || '',
    gstin: s.gstin || '',
    isActive: s.is_active,
  }));
}

export async function createSupplier(data: {
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}) {
  if (!data.name?.trim()) {
    throw new AppError('VALIDATION_FAILED', 'Supplier name is required', 400);
  }

  const existing = await prisma.supplier.findUnique({
    where: { name: data.name.trim() },
  });
  if (existing) {
    throw new AppError('CONFLICT', 'Supplier with this name already exists', 409);
  }

  return prisma.supplier.create({
    data: {
      name: data.name.trim(),
      contact: data.contact?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      gstin: data.gstin?.trim() || null,
      is_active: true,
    },
  });
}

export async function listPurchaseOrders() {
  const pos = await prisma.purchaseOrder.findMany({
    include: {
      supplier: { select: { name: true } },
      lines: { select: { id: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return pos.map((po) => ({
    id: po.id,
    poNumber: po.po_number,
    supplierName: po.supplier.name,
    status: po.status,
    orderedOn: po.ordered_on.toISOString().split('T')[0],
    expectedOn: po.expected_on ? po.expected_on.toISOString().split('T')[0] : null,
    totalPaise: Number(po.total_paise),
    lineCount: po.lines.length,
  }));
}

export async function getPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: {
        include: {
          product: { select: { id: true, name: true, sku: true, category: true } },
        },
      },
    },
  });

  if (!po) {
    throw new AppError('NOT_FOUND', 'Purchase order not found', 404);
  }

  return {
    id: po.id,
    poNumber: po.po_number,
    supplierId: po.supplier_id,
    supplierName: po.supplier.name,
    status: po.status,
    orderedOn: po.ordered_on.toISOString().split('T')[0],
    expectedOn: po.expected_on ? po.expected_on.toISOString().split('T')[0] : null,
    totalPaise: Number(po.total_paise),
    lines: po.lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product.name,
      productSku: l.product.sku,
      qtyOrdered: Number(l.qty_ordered),
      qtyReceived: Number(l.qty_received),
      unitCostPaise: Number(l.unit_cost_paise),
    })),
  };
}

export async function createPurchaseOrder(
  data: {
    supplierId: string;
    orderedOn?: string;
    expectedOn?: string;
    lines: Array<{
      productId: string;
      qtyOrdered: number;
      unitCostPaise: number;
    }>;
  },
  actorId?: string
) {
  if (!data.supplierId) {
    throw new AppError('VALIDATION_FAILED', 'Supplier is required', 400);
  }
  if (!data.lines || data.lines.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'At least one line item is required', 400);
  }

  // Find a default system user if actorId is not provided
  let creatorId = actorId;
  if (!creatorId) {
    const user = await prisma.user.findFirst();
    if (user) creatorId = user.id;
  }
  if (!creatorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  const now = new Date();
  const year = now.getFullYear();
  const count = await prisma.purchaseOrder.count();
  const poNumber = `PO-${year}-${String(count + 1).padStart(4, '0')}`;

  let totalPaise = 0n;
  data.lines.forEach((l) => {
    totalPaise += BigInt(Math.round(l.qtyOrdered * l.unitCostPaise));
  });

  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        po_number: poNumber,
        supplier_id: data.supplierId,
        status: POStatus.OPEN,
        ordered_on: data.orderedOn ? new Date(data.orderedOn) : now,
        expected_on: data.expectedOn ? new Date(data.expectedOn) : null,
        total_paise: totalPaise,
        created_by: creatorId!,
        lines: {
          create: data.lines.map((l) => ({
            product_id: l.productId,
            qty_ordered: l.qtyOrdered,
            unit_cost_paise: BigInt(l.unitCostPaise),
          })),
        },
      },
      include: { lines: true },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: creatorId,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        action: 'PO_CREATED',
        after: { poNumber, totalPaise: Number(totalPaise) },
      },
      tx
    );

    return po;
  });
}

export interface ReceiveLineItem {
  productId: string;
  qty: number;
  unitCostPaise: number;
  poLineId?: string;
  serialNumbers?: string[];
}

export interface ReceiveGoodsInput {
  receiptNumber?: string;
  supplierId?: string;
  poId?: string;
  supplierInvoiceRef?: string;
  locationId: string;
  receivedOn?: string | Date;
  lines: ReceiveLineItem[];
  actorId?: string;
}

/**
 * Phase 5 - Stock Receipt with Serial Capture, Unit Creation, Movements, and Weighted Average Cost
 * (Spec 6.3 Phase 5, TRD 2.4, ADR D2, D4)
 */
export async function receiveGoods(input: ReceiveGoodsInput) {
  if (!input.lines || input.lines.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'At least one line item is required for stock receipt', 400);
  }
  if (!input.locationId) {
    throw new AppError('VALIDATION_FAILED', 'Destination stock location is required', 400);
  }

  let actorId = input.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Verify destination stock location
    const location = await tx.stockLocation.findUnique({
      where: { id: input.locationId },
    });
    if (!location) {
      throw new AppError('NOT_FOUND', 'Stock location not found', 404);
    }

    // 2. Validate products & serial numbers
    const productCache = new Map<string, { name: string; isSerialized: boolean }>();
    for (const line of input.lines) {
      if (line.qty <= 0) {
        throw new AppError('VALIDATION_FAILED', 'Receipt quantity must be greater than zero', 400);
      }

      const product = await tx.product.findUnique({
        where: { id: line.productId },
      });
      if (!product) {
        throw new AppError('NOT_FOUND', `Product not found: ${line.productId}`, 404);
      }
      productCache.set(product.id, { name: product.name, isSerialized: product.is_serialized });

      if (product.is_serialized) {
        if (!line.serialNumbers || line.serialNumbers.length !== line.qty) {
          throw new AppError(
            'SERIAL_REQUIRED',
            `Product ${product.name} is serialized: exactly ${line.qty} serial number(s) required`,
            400
          );
        }

        // Check for duplicates within the current submission
        const serialSet = new Set(line.serialNumbers.map((s) => s.trim().toUpperCase()));
        if (serialSet.size !== line.serialNumbers.length) {
          throw new AppError('DUPLICATE_SERIAL', 'Duplicate serial number within the receipt payload', 409);
        }

        // Check for existing units in the database
        const existingUnit = await tx.inventoryUnit.findFirst({
          where: {
            product_id: line.productId,
            serial_number: { in: Array.from(serialSet) },
          },
        });
        if (existingUnit) {
          throw new AppError(
            'DUPLICATE_SERIAL',
            `Serial number already exists for product ${product.name}: ${existingUnit.serial_number}`,
            409
          );
        }
      }
    }

    // 3. Generate receipt number if not provided
    const now = new Date();
    const receivedOn = input.receivedOn ? new Date(input.receivedOn) : now;
    let receiptNumber = input.receiptNumber;
    if (!receiptNumber) {
      const year = now.getFullYear();
      const count = await tx.purchaseReceipt.count();
      receiptNumber = `RCV-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    // Compute total paise
    let totalPaise = 0n;
    for (const line of input.lines) {
      totalPaise += BigInt(Math.round(line.qty * line.unitCostPaise));
    }

    // 4. Create PurchaseReceipt
    const receipt = await tx.purchaseReceipt.create({
      data: {
        receipt_number: receiptNumber,
        supplier_id: input.supplierId || null,
        po_id: input.poId || null,
        supplier_invoice_ref: input.supplierInvoiceRef || null,
        received_on: receivedOn,
        location_id: input.locationId,
        total_paise: totalPaise,
        created_by: actorId!,
      },
    });

    const createdUnits: Array<{
      id: string;
      productId: string;
      productName: string;
      serialNumber: string;
      qrCode: string;
    }> = [];

    // 5. Process each line: lines, units, stock levels & weighted average cost, movements
    for (const line of input.lines) {
      const receiptLine = await tx.purchaseReceiptLine.create({
        data: {
          receipt_id: receipt.id,
          po_line_id: line.poLineId || null,
          product_id: line.productId,
          qty: line.qty,
          unit_cost_paise: BigInt(line.unitCostPaise),
        },
      });

      // Update PO line received quantity if attached to a PO
      if (line.poLineId) {
        await tx.purchaseOrderLine.update({
          where: { id: line.poLineId },
          data: {
            qty_received: { increment: line.qty },
          },
        });
      }

      // Create serialized inventory units if product is serialized
      if (line.serialNumbers && line.serialNumbers.length > 0) {
        for (const rawSerial of line.serialNumbers) {
          const serial = rawSerial.trim().toUpperCase();
          const qrCode = `QR-${serial}-${randomBytes(4).toString('hex').toUpperCase()}`;

          const unit = await tx.inventoryUnit.create({
            data: {
              product_id: line.productId,
              serial_number: serial,
              qr_code: qrCode,
              status: UnitStatus.IN_STOCK,
              location_id: input.locationId,
              receipt_line_id: receiptLine.id,
              unit_cost_paise: BigInt(line.unitCostPaise),
            },
          });

          createdUnits.push({
            id: unit.id,
            productId: unit.product_id,
            productName: productCache.get(unit.product_id)?.name ?? '',
            serialNumber: unit.serial_number,
            qrCode: unit.qr_code,
          });

          // Unit creation movement
          await tx.stockMovement.create({
            data: {
              product_id: line.productId,
              unit_id: unit.id,
              qty: 1,
              to_location_id: input.locationId,
              type: MovementType.RECEIPT,
              unit_cost_paise: BigInt(line.unitCostPaise),
              ref_type: 'purchase_receipt',
              ref_id: receipt.id,
              reason: `Stock receipt ${receiptNumber} serial ${serial}`,
              created_by: actorId!,
            },
          });
        }
      } else {
        // Non-serialized movement
        await tx.stockMovement.create({
          data: {
            product_id: line.productId,
            qty: line.qty,
            to_location_id: input.locationId,
            type: MovementType.RECEIPT,
            unit_cost_paise: BigInt(line.unitCostPaise),
            ref_type: 'purchase_receipt',
            ref_id: receipt.id,
            reason: `Stock receipt ${receiptNumber}`,
            created_by: actorId!,
          },
        });
      }

      // 6. Update StockLevel with Weighted Average Cost (WAC)
      const currentLevel = await tx.stockLevel.findUnique({
        where: {
          product_id_location_id: {
            product_id: line.productId,
            location_id: input.locationId,
          },
        },
      });

      if (currentLevel) {
        const oldOnHand = Number(currentLevel.on_hand);
        const oldAvgCost = currentLevel.avg_cost_paise;
        const newOnHand = oldOnHand + line.qty;

        // WAC formula: (oldOnHand * oldAvgCost + incomingQty * incomingCost) / newOnHand
        let newAvgCostPaise = BigInt(line.unitCostPaise);
        if (newOnHand > 0) {
          const totalExistingVal = BigInt(Math.round(oldOnHand)) * oldAvgCost;
          const totalIncomingVal = BigInt(Math.round(line.qty)) * BigInt(line.unitCostPaise);
          newAvgCostPaise = (totalExistingVal + totalIncomingVal) / BigInt(Math.round(newOnHand));
        }

        await tx.stockLevel.update({
          where: {
            product_id_location_id: {
              product_id: line.productId,
              location_id: input.locationId,
            },
          },
          data: {
            on_hand: { increment: line.qty },
            avg_cost_paise: newAvgCostPaise,
          },
        });
      } else {
        await tx.stockLevel.create({
          data: {
            product_id: line.productId,
            location_id: input.locationId,
            on_hand: line.qty,
            reserved: 0,
            avg_cost_paise: BigInt(line.unitCostPaise),
          },
        });
      }
    }

    // 7. If receiving against a PurchaseOrder, evaluate overall PO completion status
    if (input.poId) {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: input.poId },
        include: { lines: true },
      });

      if (po) {
        const allCompleted = po.lines.every((l) => Number(l.qty_received) >= Number(l.qty_ordered));
        const newStatus = allCompleted ? POStatus.RECEIVED : POStatus.PARTIAL;

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: newStatus },
        });
      }
    }

    // 8. Record audit trail
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'PURCHASE_RECEIPT',
        entityId: receipt.id,
        action: 'GOODS_RECEIVED',
        after: {
          receiptNumber,
          lineCount: input.lines.length,
          unitsCreated: createdUnits.length,
          totalPaise: Number(totalPaise),
        },
      },
      tx
    );

    return {
      receiptId: receipt.id,
      receiptNumber: receipt.receipt_number,
      totalPaise: Number(totalPaise),
      units: createdUnits,
    };
  }).then((result) => {
    // Fire-and-forget low-stock evaluation for every received product after
    // the receipt commits (FR-5.3). Alerting issues never fail the receipt.
    for (const productId of new Set(input.lines.map((l) => l.productId))) {
      notifyLowStock(productId, actorId).catch(() => {});
    }
    return result;
  });
}

/**
 * Cancels a purchase order (FR-5.8). Only DRAFT / OPEN / PARTIAL orders can
 * be cancelled; received goods are unaffected (the ledger is append-only) and
 * already-received quantities simply remain in stock.
 */
export async function cancelPurchaseOrder(poId: string, reason: string, actorId?: string) {
  if (!reason || !reason.trim()) {
    throw new AppError('VALIDATION_FAILED', 'A cancellation reason is required', 422);
  }

  let cancellerId = actorId;
  if (!cancellerId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) cancellerId = defaultUser.id;
  }
  if (!cancellerId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: true, supplier: true },
    });
    if (!po) {
      throw new AppError('NOT_FOUND', 'Purchase order not found', 404);
    }

    const cancellableStatuses: POStatus[] = [POStatus.DRAFT, POStatus.OPEN, POStatus.PARTIAL];
    if (!cancellableStatuses.includes(po.status)) {
      throw new AppError(
        'INVALID_STATE',
        `Purchase order in ${po.status} status cannot be cancelled`,
        409
      );
    }

    const cancelled = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.CANCELLED },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: cancellerId!,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        action: 'PO_CANCELLED',
        before: { status: po.status },
        after: {
          status: POStatus.CANCELLED,
          poNumber: po.po_number,
          reason: reason.trim(),
          receivedLines: po.lines.filter((l) => Number(l.qty_received) > 0).length,
        },
      },
      tx
    );

    return {
      id: cancelled.id,
      poNumber: cancelled.po_number,
      status: cancelled.status,
    };
  });
}

/**
 * Creates a DRAFT purchase order restocking the given low-stock products
 * (FR-5.8 / FR-5.3). Line quantity heuristic: reorder_level * 2 - available
 * (at least 1); unit cost = product standard cost.
 *
 * Supplier: the Product model has no default-supplier field, so the first
 * active supplier (alphabetical) is attached — the PO is a DRAFT explicitly
 * meant to be reviewed and edited before opening.
 */
export async function createDraftPOForLowStock(productIds: string[], actorId?: string) {
  if (!productIds || productIds.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'At least one product id is required', 400);
  }

  let creatorId = actorId;
  if (!creatorId) {
    const user = await prisma.user.findFirst();
    if (user) creatorId = user.id;
  }
  if (!creatorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, is_active: true },
  });
  if (products.length === 0) {
    throw new AppError('NOT_FOUND', 'No active products found for the given ids', 404);
  }

  const supplier = await prisma.supplier.findFirst({
    where: { is_active: true },
    orderBy: { name: 'asc' },
  });
  if (!supplier) {
    throw new AppError(
      'CONFLICT',
      'No active supplier exists. Create a supplier before generating draft purchase orders.',
      409
    );
  }

  // Availability per product across all locations
  const levels = await prisma.stockLevel.findMany({
    where: { product_id: { in: products.map((p) => p.id) } },
    select: { product_id: true, on_hand: true, reserved: true },
  });
  const availability = new Map<string, number>();
  for (const level of levels) {
    const current = availability.get(level.product_id) ?? 0;
    availability.set(level.product_id, current + Number(level.on_hand) - Number(level.reserved));
  }

  const lines = products
    .map((product) => {
      const available = availability.get(product.id) ?? 0;
      const reorderLevel = Number(product.reorder_level);
      const qty = Math.max(1, Math.ceil(reorderLevel * 2 - available));
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        qtyOrdered: qty,
        unitCostPaise: Number(product.std_cost_paise),
        available,
        reorderLevel,
      };
    })
    .filter((l) => l.qtyOrdered > 0);

  if (lines.length === 0) {
    throw new AppError('CONFLICT', 'All selected products are already above their reorder level', 409);
  }

  const totalPaise = lines.reduce((sum, l) => sum + Math.round(l.qtyOrdered * l.unitCostPaise), 0);

  const now = new Date();
  const year = now.getFullYear();
  const count = await prisma.purchaseOrder.count();
  const poNumber = `PO-${year}-${String(count + 1).padStart(4, '0')}`;

  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        po_number: poNumber,
        supplier_id: supplier.id,
        status: POStatus.DRAFT,
        ordered_on: now,
        expected_on: null,
        total_paise: BigInt(totalPaise),
        created_by: creatorId!,
        lines: {
          create: lines.map((l) => ({
            product_id: l.productId,
            qty_ordered: l.qtyOrdered,
            unit_cost_paise: BigInt(l.unitCostPaise),
          })),
        },
      },
      include: { lines: true },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: creatorId!,
        entityType: 'PURCHASE_ORDER',
        entityId: created.id,
        action: 'PO_DRAFT_CREATED_FOR_LOW_STOCK',
        after: {
          poNumber,
          supplierName: supplier.name,
          lines: lines.map((l) => ({
            sku: l.sku,
            qtyOrdered: l.qtyOrdered,
            available: l.available,
            reorderLevel: l.reorderLevel,
          })),
          totalPaise,
        },
      },
      tx
    );

    return created;
  });

  return {
    id: po.id,
    poNumber: po.po_number,
    status: po.status,
    supplierName: supplier.name,
    totalPaise,
    lines,
  };
}
