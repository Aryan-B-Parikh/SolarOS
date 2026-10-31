/**
 * SunPower Ops - Inventory Domain Service (TRD 2.4, Spec 6.3 Phase 5, ADR D2, D3)
 * Append-only ledger movements, 3-state stock levels (on_hand, reserved, available),
 * low-stock alerts, and audited adjustments.
 */

import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { queueNotification } from '@/lib/outbox';
import { logger } from '@/lib/logger';
import { MovementType } from '@prisma/client';

export interface StockOverviewItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  isSerialized: boolean;
  locationId: string;
  locationName: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  avgCostPaise: number;
  isLowStock: boolean;
}

export interface AdjustStockInput {
  productId: string;
  locationId: string;
  qtyDelta: number; // positive for addition, negative for reduction
  reason: string;
  actorId?: string;
}

/**
 * Returns current inventory levels across products and locations,
 * calculating available balance (on_hand - reserved) and flagging low stock items.
 */
export async function getStockOverview(params?: {
  locationId?: string;
  lowStockOnly?: boolean;
}): Promise<StockOverviewItem[]> {
  const whereClause: any = {};
  if (params?.locationId) {
    whereClause.location_id = params.locationId;
  }

  const stockLevels = await prisma.stockLevel.findMany({
    where: whereClause,
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          category: true,
          uom: true,
          is_serialized: true,
          reorder_level: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: {
      product: { name: 'asc' },
    },
  });

  const items: StockOverviewItem[] = stockLevels.map((sl) => {
    const onHand = Number(sl.on_hand);
    const reserved = Number(sl.reserved);
    const available = Math.max(0, onHand - reserved);
    const reorderLevel = Number(sl.product.reorder_level);
    const isLowStock = available <= reorderLevel;

    return {
      productId: sl.product_id,
      sku: sl.product.sku,
      name: sl.product.name,
      category: sl.product.category,
      uom: sl.product.uom,
      isSerialized: sl.product.is_serialized,
      locationId: sl.location_id,
      locationName: sl.location.name,
      onHand,
      reserved,
      available,
      reorderLevel,
      avgCostPaise: Number(sl.avg_cost_paise),
      isLowStock,
    };
  });

  if (params?.lowStockOnly) {
    return items.filter((item) => item.isLowStock);
  }

  return items;
}

/**
 * Executes an audited manual inventory adjustment (damage, stocktake discrepancy).
 * Strictly prevents available stock or on-hand balance from going negative.
 * Appends to stock_movements ledger (ADR D2).
 */
export async function adjustStock(input: AdjustStockInput) {
  if (!input.reason?.trim()) {
    throw new AppError('VALIDATION_FAILED', 'A clear justification reason is mandatory for stock adjustment', 400);
  }
  if (!input.qtyDelta || input.qtyDelta === 0) {
    throw new AppError('VALIDATION_FAILED', 'Quantity delta must be non-zero', 400);
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
    const stockLevel = await tx.stockLevel.findUnique({
      where: {
        product_id_location_id: {
          product_id: input.productId,
          location_id: input.locationId,
        },
      },
      include: {
        product: true,
        location: true,
      },
    });

    if (!stockLevel) {
      throw new AppError('NOT_FOUND', 'Stock level record not found for product at specified location', 404);
    }

    const currentOnHand = Number(stockLevel.on_hand);
    const currentReserved = Number(stockLevel.reserved);
    const targetOnHand = currentOnHand + input.qtyDelta;

    // Guard against driving stock negative
    if (targetOnHand < 0) {
      throw new AppError(
        'INSUFFICIENT_STOCK',
        `Cannot reduce stock by ${Math.abs(input.qtyDelta)}; on-hand is only ${currentOnHand}`,
        400
      );
    }

    // Guard against violating reserved allocation: on_hand must remain >= reserved
    if (targetOnHand < currentReserved) {
      throw new AppError(
        'INSUFFICIENT_STOCK',
        `Cannot reduce stock below active reserved allocations (on-hand after reduction: ${targetOnHand}, reserved: ${currentReserved})`,
        400
      );
    }

    // 1. Update stock level
    const updated = await tx.stockLevel.update({
      where: {
        product_id_location_id: {
          product_id: input.productId,
          location_id: input.locationId,
        },
      },
      data: {
        on_hand: targetOnHand,
      },
    });

    // 2. Append ledger movement
    const movementType = input.qtyDelta > 0 ? MovementType.ADJUST_IN : MovementType.ADJUST_OUT;
    const movement = await tx.stockMovement.create({
      data: {
        product_id: input.productId,
        qty: Math.abs(input.qtyDelta),
        from_location_id: input.qtyDelta < 0 ? input.locationId : null,
        to_location_id: input.qtyDelta > 0 ? input.locationId : null,
        type: movementType,
        unit_cost_paise: stockLevel.avg_cost_paise,
        ref_type: 'adjustment',
        ref_id: input.productId,
        reason: input.reason.trim(),
        created_by: actorId!,
      },
    });

    // 3. Write immutable audit log
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'STOCK_LEVEL',
        entityId: `${input.productId}:${input.locationId}`,
        action: 'STOCK_ADJUSTED',
        before: { onHand: currentOnHand, reserved: currentReserved },
        after: {
          onHand: targetOnHand,
          reserved: currentReserved,
          delta: input.qtyDelta,
          reason: input.reason,
          movementId: movement.id,
        },
      },
      tx
    );

    return {
      productId: input.productId,
      locationId: input.locationId,
      onHand: Number(updated.on_hand),
      reserved: Number(updated.reserved),
      available: Number(updated.on_hand) - Number(updated.reserved),
      movementId: movement.id,
    };
  }).then((result) => {
    // Fire-and-forget low-stock check after the adjustment commits (FR-5.3)
    notifyLowStock(input.productId, actorId).catch(() => {});
    return result;
  });
}

/**
 * Low-stock alerting (FR-5.3): after any stock change, evaluates products
 * whose total available balance (on_hand - reserved across all locations)
 * has fallen to or below the reorder level and queues a LOW_STOCK_ALERT
 * email to every active DIRECTOR and WAREHOUSE user.
 *
 * Idempotent per product + observed quantity: the outbox idempotency key
 * `low-stock:<productId>:<availableQty>` prevents duplicate alerts until the
 * availability changes again.
 *
 * Designed to be invoked fire-and-forget (`.catch`) so alerting issues never
 * break the main stock flow.
 */
export async function notifyLowStock(productId?: string, actorId?: string) {
  // Aggregate availability per product across every location
  const levels = await prisma.stockLevel.findMany({
    where: productId ? { product_id: productId } : undefined,
    select: {
      product_id: true,
      on_hand: true,
      reserved: true,
      product: {
        select: { sku: true, name: true, reorder_level: true, is_active: true },
      },
    },
  });

  const availabilityByProduct = new Map<
    string,
    { sku: string; productName: string; reorderLevel: number; availableQty: number; isActive: boolean }
  >();
  for (const level of levels) {
    const entry = availabilityByProduct.get(level.product_id) ?? {
      sku: level.product.sku,
      productName: level.product.name,
      reorderLevel: Number(level.product.reorder_level),
      availableQty: 0,
      isActive: level.product.is_active,
    };
    entry.availableQty += Number(level.on_hand) - Number(level.reserved);
    availabilityByProduct.set(level.product_id, entry);
  }

  const lowStock = Array.from(availabilityByProduct.entries())
    .filter(([, v]) => v.isActive && v.availableQty <= v.reorderLevel)
    .map(([id, v]) => ({ productId: id, ...v }));

  if (lowStock.length === 0) return { alerted: 0, lowStock: [] as string[] };

  // Alert recipients: all active DIRECTOR and WAREHOUSE users
  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ['DIRECTOR', 'WAREHOUSE'] },
      is_active: true,
    },
    select: { email: true },
  });
  const emails = recipients.map((r) => r.email).filter(Boolean);

  let alerted = 0;
  for (const item of lowStock) {
    for (const email of emails) {
      try {
        await queueNotification({
          channel: 'EMAIL',
          recipient: email,
          template: 'LOW_STOCK_ALERT',
          payload: {
            sku: item.sku,
            productName: item.productName,
            availableQty: item.availableQty,
            reorderLevel: item.reorderLevel,
          },
          idempotencyKey: `low-stock:${item.productId}:${item.availableQty}`,
        });
        alerted++;
      } catch (err: any) {
        // Duplicate idempotency key means this alert was already queued —
        // anything else is logged and skipped without failing the batch.
        logger.warn('Low stock alert skipped', {
          productId: item.productId,
          recipient: email,
          error: String(err?.message || err),
        });
      }
    }
  }

  if (actorId) {
    await recordAudit({
      actorType: 'USER',
      actorId,
      entityType: 'PRODUCT',
      entityId: lowStock[0].productId,
      action: 'LOW_STOCK_ALERTED',
      after: {
        lowStockProducts: lowStock.map((i) => ({ sku: i.sku, availableQty: i.availableQty })),
        notificationsQueued: alerted,
      },
    }).catch(() => {});
  }

  return { alerted, lowStock: lowStock.map((i) => i.sku) };
}

/**
 * Reconciles the append-only stock_movements ledger against current stock_levels.
 * Verifies that the mathematical sum of net movements equals the recorded on_hand balance.
 */
export async function reconcileStockLedger(productId: string, locationId: string): Promise<{
  productId: string;
  locationId: string;
  onHandRecorded: number;
  ledgerNetSum: number;
  isReconciled: boolean;
}> {
  const stockLevel = await prisma.stockLevel.findUnique({
    where: {
      product_id_location_id: {
        product_id: productId,
        location_id: locationId,
      },
    },
  });

  const onHandRecorded = stockLevel ? Number(stockLevel.on_hand) : 0;

  // Inbound movements: to_location_id = locationId
  const inMovements = await prisma.stockMovement.aggregate({
    where: {
      product_id: productId,
      to_location_id: locationId,
    },
    _sum: { qty: true },
  });

  // Outbound movements: from_location_id = locationId
  const outMovements = await prisma.stockMovement.aggregate({
    where: {
      product_id: productId,
      from_location_id: locationId,
    },
    _sum: { qty: true },
  });

  const totalIn = Number(inMovements._sum.qty || 0);
  const totalOut = Number(outMovements._sum.qty || 0);
  const ledgerNetSum = totalIn - totalOut;

  return {
    productId,
    locationId,
    onHandRecorded,
    ledgerNetSum,
    isReconciled: Math.abs(onHandRecorded - ledgerNetSum) < 0.001,
  };
}

/**
 * Reconciles all active stock levels across all locations against their ledger movements.
 */
export async function reconcileAllStockLedgers() {
  const stockLevels = await prisma.stockLevel.findMany({
    include: { product: true, location: true },
  });
  const results = [];
  for (const sl of stockLevels) {
    const res = await reconcileStockLedger(sl.product_id, sl.location_id);
    results.push({
      ...res,
      productSku: sl.product.sku,
      locationCode: sl.location.code,
    });
  }
  return {
    timestamp: new Date().toISOString(),
    totalChecked: results.length,
    allReconciled: results.every((r) => r.isReconciled),
    discrepancies: results.filter((r) => !r.isReconciled),
    details: results,
  };
}

