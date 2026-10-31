import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReservationPlan,
  calculateCancellationRelease,
  type StockLevelSnapshot,
} from '../../src/domain/reservation.ts';

describe('Member 1 - Stock Reservation Engine (FR-4.4 / ADR D3)', () => {
  it('reserves available stock and reduces available balance without deducting on_hand', () => {
    const stockLevels = new Map<string, StockLevelSnapshot>([
      [
        'prod-inverter',
        { productId: 'prod-inverter', locationId: 'loc-1', onHand: 10, reserved: 2 },
      ],
    ]);

    // Available was 10 - 2 = 8. Request 3.
    const plan = calculateReservationPlan(
      [{ orderLineId: 'line-1', productId: 'prod-inverter', qtyRequired: 3 }],
      stockLevels
    );

    assert.equal(plan.hasShortage, false);
    assert.equal(plan.allocations[0].qtyToReserve, 3);
    assert.equal(plan.allocations[0].qtyShortage, 0);
    assert.equal(plan.allocations[0].newReservedLevel, 5); // 2 + 3 = 5
  });

  it('handles stock shortage gracefully without driving available or reserved negative', () => {
    const stockLevels = new Map<string, StockLevelSnapshot>([
      [
        'prod-panel',
        { productId: 'prod-panel', locationId: 'loc-1', onHand: 5, reserved: 4 },
      ],
    ]);

    // Available is 5 - 4 = 1. Request 6 panels.
    const plan = calculateReservationPlan(
      [{ orderLineId: 'line-panel', productId: 'prod-panel', qtyRequired: 6 }],
      stockLevels
    );

    assert.equal(plan.hasShortage, true);
    assert.equal(plan.allocations[0].qtyToReserve, 1);
    assert.equal(plan.allocations[0].qtyShortage, 5);
    assert.equal(plan.allocations[0].newReservedLevel, 5); // Maxed out at onHand = 5
    assert.equal(plan.shortagesByProduct['prod-panel'], 5);
  });

  it('sorts line requests deterministically by productId to prevent database deadlocks', () => {
    const stockLevels = new Map<string, StockLevelSnapshot>();

    const requests = [
      { orderLineId: 'line-z', productId: 'prod-zzz', qtyRequired: 1 },
      { orderLineId: 'line-a', productId: 'prod-aaa', qtyRequired: 1 },
      { orderLineId: 'line-m', productId: 'prod-mmm', qtyRequired: 1 },
    ];

    const plan = calculateReservationPlan(requests, stockLevels);
    assert.equal(plan.allocations[0].productId, 'prod-aaa');
    assert.equal(plan.allocations[1].productId, 'prod-mmm');
    assert.equal(plan.allocations[2].productId, 'prod-zzz');
  });

  it('restores reserved balance on order cancellation', () => {
    const stockLevels = new Map<string, StockLevelSnapshot>([
      [
        'prod-inv',
        { productId: 'prod-inv', locationId: 'loc-1', onHand: 10, reserved: 4 },
      ],
    ]);

    // Cancel an allocation of 3 inverters
    const newLevels = calculateCancellationRelease(
      [{ productId: 'prod-inv', qty: 3 }],
      stockLevels
    );

    assert.equal(newLevels.get('prod-inv'), 1); // 4 - 3 = 1 reserved remaining
  });
});
