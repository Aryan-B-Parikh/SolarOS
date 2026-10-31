import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 5 - Stock Receipt, Serial Capture & Inventory Valuation (Spec 6.3, ADR D2, D3)', () => {
  function computeWeightedAverageCost(
    oldOnHand: number,
    oldAvgCostPaise: bigint,
    incomingQty: number,
    incomingCostPaise: bigint
  ): bigint {
    const newOnHand = oldOnHand + incomingQty;
    if (newOnHand <= 0) return incomingCostPaise;

    const totalOldVal = BigInt(Math.round(oldOnHand)) * oldAvgCostPaise;
    const totalIncomingVal = BigInt(Math.round(incomingQty)) * incomingCostPaise;
    return (totalOldVal + totalIncomingVal) / BigInt(Math.round(newOnHand));
  }

  function validateReceiptSerials(
    isSerialized: boolean,
    qty: number,
    serials?: string[]
  ): { valid: boolean; error?: string } {
    if (!isSerialized) {
      return { valid: true };
    }

    if (!serials || serials.length !== qty) {
      return { valid: false, error: 'SERIAL_COUNT_MISMATCH' };
    }

    const unique = new Set(serials.map((s) => s.trim().toUpperCase()));
    if (unique.size !== serials.length) {
      return { valid: false, error: 'DUPLICATE_SERIAL' };
    }

    return { valid: true };
  }

  function validateStockAdjustment(
    onHand: number,
    reserved: number,
    delta: number
  ): { valid: boolean; error?: string; newOnHand?: number; newAvailable?: number } {
    const targetOnHand = onHand + delta;

    if (targetOnHand < 0) {
      return { valid: false, error: 'NEGATIVE_ON_HAND' };
    }

    if (targetOnHand < reserved) {
      return { valid: false, error: 'INSUFFICIENT_STOCK_BELOW_RESERVED' };
    }

    return {
      valid: true,
      newOnHand: targetOnHand,
      newAvailable: targetOnHand - reserved,
    };
  }

  it('computes weighted average cost accurately when receiving higher-cost units', () => {
    // 10 units in stock @ Rs 1,000 (100,000 paise)
    // 5 new units received @ Rs 1,300 (130,000 paise)
    // Total value = 1,000,000 + 650,000 = 1,650,000 paise
    // New WAC = 1,650,000 / 15 = 110,000 paise (Rs 1,100)
    const newWac = computeWeightedAverageCost(10, 100000n, 5, 130000n);
    assert.equal(newWac, 110000n);
  });

  it('initializes average cost to incoming cost when current on_hand is zero', () => {
    const initialWac = computeWeightedAverageCost(0, 0n, 10, 2500000n);
    assert.equal(initialWac, 2500000n);
  });

  it('enforces exact serial count for serialized inventory receipts', () => {
    // 3 inverters received, but only 2 serial numbers provided
    const res = validateReceiptSerials(true, 3, ['INV-001', 'INV-002']);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'SERIAL_COUNT_MISMATCH');

    // 3 inverters received with 3 serial numbers
    const validRes = validateReceiptSerials(true, 3, ['INV-001', 'INV-002', 'INV-003']);
    assert.equal(validRes.valid, true);
  });

  it('detects and rejects duplicate serials within the receipt payload', () => {
    const res = validateReceiptSerials(true, 2, ['INV-SAME', 'INV-SAME']);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'DUPLICATE_SERIAL');
  });

  it('permits non-serialized receipts without serial numbers', () => {
    const res = validateReceiptSerials(false, 100, undefined);
    assert.equal(res.valid, true);
  });

  it('prevents stock adjustments that would drive inventory below active reservations', () => {
    // 10 on hand, 8 reserved -> available = 2
    // Attempting to adjust down by 3 (new on_hand = 7 < 8 reserved)
    const res = validateStockAdjustment(10, 8, -3);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'INSUFFICIENT_STOCK_BELOW_RESERVED');
  });

  it('allows valid stock adjustments and recomputes available balance', () => {
    // 10 on hand, 8 reserved -> available = 2
    // Adjust down by 1 -> new on_hand = 9, new available = 1
    const res = validateStockAdjustment(10, 8, -1);
    assert.equal(res.valid, true);
    assert.equal(res.newOnHand, 9);
    assert.equal(res.newAvailable, 1);
  });
});

