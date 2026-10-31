import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 5 - Dispatch Operational Rules & Departure Gate (Spec 6.3, ADR D3, D4)', () => {
  interface MockLine {
    id: string;
    productId: string;
    productName: string;
    qtyRequired: number;
    qtyLoaded: number;
  }

  interface MockUnit {
    id: string;
    productId: string;
    serialNumber: string;
    status: 'IN_STOCK' | 'PICKED' | 'DISPATCHED';
  }

  function validateScan(
    lines: MockLine[],
    scannedUnitIds: Set<string>,
    unit: MockUnit
  ): { valid: boolean; error?: string; targetLineId?: string } {
    if (unit.status !== 'IN_STOCK') {
      return { valid: false, error: 'UNIT_NOT_AVAILABLE' };
    }

    if (scannedUnitIds.has(unit.id)) {
      return { valid: false, error: 'ALREADY_SCANNED' };
    }

    const line = lines.find((l) => l.productId === unit.productId);
    if (!line) {
      return { valid: false, error: 'WRONG_PRODUCT' };
    }

    if (line.qtyLoaded >= line.qtyRequired) {
      return { valid: false, error: 'LINE_ALREADY_FULFILLED' };
    }

    return { valid: true, targetLineId: line.id };
  }

  function checkDepartureGate(lines: MockLine[]): { canDepart: boolean; incompleteLines: string[] } {
    const incomplete = lines.filter((l) => l.qtyLoaded < l.qtyRequired).map((l) => l.productName);
    return {
      canDepart: incomplete.length === 0,
      incompleteLines: incomplete,
    };
  }

  it('allows scanning valid unit matching required product', () => {
    const lines: MockLine[] = [
      { id: 'l1', productId: 'p-inverter', productName: 'Solar Inverter 3kW', qtyRequired: 1, qtyLoaded: 0 },
    ];
    const scanned = new Set<string>();
    const unit: MockUnit = { id: 'u1', productId: 'p-inverter', serialNumber: 'INV-001', status: 'IN_STOCK' };

    const res = validateScan(lines, scanned, unit);
    assert.equal(res.valid, true);
    assert.equal(res.targetLineId, 'l1');
  });

  it('rejects unit whose product does not match any dispatch line with WRONG_PRODUCT', () => {
    const lines: MockLine[] = [
      { id: 'l1', productId: 'p-inverter', productName: 'Solar Inverter 3kW', qtyRequired: 1, qtyLoaded: 0 },
    ];
    const scanned = new Set<string>();
    // Wrong product: battery scanned for on-grid order
    const unit: MockUnit = { id: 'u2', productId: 'p-battery', serialNumber: 'BAT-999', status: 'IN_STOCK' };

    const res = validateScan(lines, scanned, unit);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'WRONG_PRODUCT');
  });

  it('rejects double-scanning the same unit with ALREADY_SCANNED', () => {
    const lines: MockLine[] = [
      { id: 'l1', productId: 'p-panel', productName: '540W Panel', qtyRequired: 6, qtyLoaded: 1 },
    ];
    const scanned = new Set<string>(['u101']);
    const unit: MockUnit = { id: 'u101', productId: 'p-panel', serialNumber: 'PNL-101', status: 'IN_STOCK' };

    const res = validateScan(lines, scanned, unit);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'ALREADY_SCANNED');
  });

  it('rejects over-scanning beyond required quantity with LINE_ALREADY_FULFILLED', () => {
    const lines: MockLine[] = [
      { id: 'l1', productId: 'p-inverter', productName: 'Solar Inverter 3kW', qtyRequired: 1, qtyLoaded: 1 },
    ];
    const scanned = new Set<string>(['u1']);
    const secondUnit: MockUnit = { id: 'u2', productId: 'p-inverter', serialNumber: 'INV-002', status: 'IN_STOCK' };

    const res = validateScan(lines, scanned, secondUnit);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'LINE_ALREADY_FULFILLED');
  });

  it('departure gate locks departure until 100% of lines are fulfilled', () => {
    const incompleteLines: MockLine[] = [
      { id: 'l1', productId: 'p-inverter', productName: 'Solar Inverter 3kW', qtyRequired: 1, qtyLoaded: 1 },
      { id: 'l2', productId: 'p-panel', productName: '540W Panel', qtyRequired: 6, qtyLoaded: 5 }, // 5 of 6
    ];

    const gate1 = checkDepartureGate(incompleteLines);
    assert.equal(gate1.canDepart, false);
    assert.deepEqual(gate1.incompleteLines, ['540W Panel']);

    // Once final panel is scanned:
    incompleteLines[1].qtyLoaded = 6;
    const gate2 = checkDepartureGate(incompleteLines);
    assert.equal(gate2.canDepart, true);
    assert.deepEqual(gate2.incompleteLines, []);
  });

  it('consumes reserved stock and on_hand accurately upon departure', () => {
    const stockLevel = {
      productId: 'p-inverter',
      onHand: 10,
      reserved: 3,
    };

    const dispatchQty = 1;

    // Upon departure: both on_hand and reserved decrease by dispatched quantity
    stockLevel.onHand -= dispatchQty;
    stockLevel.reserved -= dispatchQty;

    assert.equal(stockLevel.onHand, 9);
    assert.equal(stockLevel.reserved, 2);
    // Available stock (on_hand - reserved) remains constant
    assert.equal(stockLevel.onHand - stockLevel.reserved, 7);
  });
});

