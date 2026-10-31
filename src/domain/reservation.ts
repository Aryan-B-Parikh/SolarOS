/**
 * SunPower Ops - Stock Reservation Engine (FR-4.4, ADR D2, ADR D3)
 * Rules:
 * 1. Available stock = On hand - Reserved.
 * 2. Available stock drops at once upon order confirmation.
 * 3. Physical on_hand is NOT deducted at reservation (only at dispatch scan).
 * 4. Orders sorted by product_id to prevent database deadlocks.
 * 5. Shortages are recorded and flagged without driving stock negative.
 */

export interface StockLevelSnapshot {
  productId: string;
  locationId: string;
  onHand: number;
  reserved: number;
}

export interface ReservationLineRequest {
  orderLineId: string;
  productId: string;
  qtyRequired: number;
  qtyAlreadyReserved?: number;
}

export interface CalculatedAllocation {
  orderLineId: string;
  productId: string;
  qtyToReserve: number;
  qtyShortage: number;
  newReservedLevel: number;
}

export interface ReservationPlan {
  allocations: CalculatedAllocation[];
  hasShortage: boolean;
  totalReservedItems: number;
  shortagesByProduct: Record<string, number>;
}

export function calculateReservationPlan(
  requests: ReservationLineRequest[],
  stockLevels: Map<string, StockLevelSnapshot>
): ReservationPlan {
  // Sort requests by productId deterministically to prevent locking deadlocks (ADR D3)
  const sortedRequests = [...requests].sort((a, b) => a.productId.localeCompare(b.productId));

  const allocations: CalculatedAllocation[] = [];
  const shortagesByProduct: Record<string, number> = {};
  let hasShortage = false;
  let totalReservedItems = 0;

  // Track running reserved balances during calculation
  const runningReserved = new Map<string, number>();

  for (const req of sortedRequests) {
    const level = stockLevels.get(req.productId) || {
      productId: req.productId,
      locationId: 'default',
      onHand: 0,
      reserved: 0,
    };

    const currentReserved = runningReserved.get(req.productId) ?? level.reserved;
    const available = Math.max(0, level.onHand - currentReserved);

    const needed = req.qtyRequired - (req.qtyAlreadyReserved || 0);
    if (needed <= 0) {
      allocations.push({
        orderLineId: req.orderLineId,
        productId: req.productId,
        qtyToReserve: 0,
        qtyShortage: 0,
        newReservedLevel: currentReserved,
      });
      continue;
    }

    const qtyToReserve = Math.min(needed, available);
    const qtyShortage = needed - qtyToReserve;

    if (qtyShortage > 0) {
      hasShortage = true;
      shortagesByProduct[req.productId] = (shortagesByProduct[req.productId] || 0) + qtyShortage;
    }

    const updatedReserved = currentReserved + qtyToReserve;
    runningReserved.set(req.productId, updatedReserved);
    totalReservedItems += qtyToReserve;

    allocations.push({
      orderLineId: req.orderLineId,
      productId: req.productId,
      qtyToReserve,
      qtyShortage,
      newReservedLevel: updatedReserved,
    });
  }

  return {
    allocations,
    hasShortage,
    totalReservedItems,
    shortagesByProduct,
  };
}

export function calculateCancellationRelease(
  allocations: { productId: string; qty: number }[],
  stockLevels: Map<string, StockLevelSnapshot>
): Map<string, number> {
  const newReservedLevels = new Map<string, number>();

  for (const alloc of allocations) {
    const level = stockLevels.get(alloc.productId);
    const currentReserved = newReservedLevels.get(alloc.productId) ?? (level?.reserved || 0);
    const releasedReserved = Math.max(0, currentReserved - alloc.qty);
    newReservedLevels.set(alloc.productId, releasedReserved);
  }

  return newReservedLevels;
}

