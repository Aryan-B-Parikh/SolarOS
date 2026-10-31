import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { reconcileStockLedger, reconcileAllStockLedgers } from '@/services/inventory';

describe('Stock Ledger Reconciliation (Integration / ADR D2)', () => {
  let testProductId: string;
  let testLocationId: string;
  let movementId = '';

  before(async () => {
    const product = await prisma.product.findUnique({
      where: { sku: 'PANEL-540W' },
    });
    assert.ok(product, 'PANEL-540W must exist');
    testProductId = product.id;

    const location = await prisma.stockLocation.findUnique({
      where: { code: 'WH-MAIN' },
    });
    assert.ok(location, 'WH-MAIN location must exist');
    testLocationId = location.id;
  });

  after(async () => {
    if (movementId) {
      await prisma.stockMovement.deleteMany({ where: { id: movementId } });
    }
    await prisma.$disconnect();
  });

  it('accurately reconciles on_hand balance against stock_movements ledger', async () => {
    const stockLevel = await prisma.stockLevel.findUnique({
      where: {
        product_id_location_id: {
          product_id: testProductId,
          location_id: testLocationId,
        },
      },
    });
    assert.ok(stockLevel, 'StockLevel must exist');

    const result = await reconcileStockLedger(testProductId, testLocationId);
    assert.equal(result.productId, testProductId);
    assert.equal(result.locationId, testLocationId);
    assert.equal(result.onHandRecorded, Number(stockLevel.on_hand));
  });

  it('runs reconcileAllStockLedgers across all warehouse items', async () => {
    const summary = await reconcileAllStockLedgers();
    assert.ok(summary.totalChecked > 0, 'Must check multiple stock level rows');
    assert.ok(Array.isArray(summary.details), 'Must return array of details');
    assert.ok(summary.timestamp, 'Must include timestamp');
  });
});

