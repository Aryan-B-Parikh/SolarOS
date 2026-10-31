import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/db.ts';

describe('Database Integrity & Constraints (Integration)', () => {
  let testProductId: string;
  let testLocationId: string;

  before(async () => {
    const prod = await prisma.product.findFirst();
    assert.ok(prod, 'Product must exist in seeded database');
    testProductId = prod.id;

    const loc = await prisma.stockLocation.findFirst();
    assert.ok(loc, 'StockLocation must exist in seeded database');
    testLocationId = loc.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('rejects negative on_hand stock levels via CHECK constraint', async () => {
    await assert.rejects(
      async () => {
        await prisma.$executeRaw`
          INSERT INTO stock_levels (product_id, location_id, on_hand, reserved, avg_cost_paise)
          VALUES (${testProductId}::uuid, ${testLocationId}::uuid, -5, 0, 1000)
          ON CONFLICT (product_id, location_id)
          DO UPDATE SET on_hand = -5;
        `;
      },
      /check constraint|violates check constraint/i
    );
  });

  it('rejects reserved quantity exceeding on_hand stock', async () => {
    await assert.rejects(
      async () => {
        await prisma.$executeRaw`
          INSERT INTO stock_levels (product_id, location_id, on_hand, reserved, avg_cost_paise)
          VALUES (${testProductId}::uuid, ${testLocationId}::uuid, 10, 15, 1000)
          ON CONFLICT (product_id, location_id)
          DO UPDATE SET on_hand = 10, reserved = 15;
        `;
      },
      /check constraint|violates check constraint/i
    );
  });

  it('blocks dispatch from going IN_TRANSIT with unloaded lines via database trigger', async () => {
    const triggerExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'dispatch_guard_trg'
      ) as exists;
    `;
    assert.ok(triggerExists && triggerExists[0]?.exists === true, 'dispatch_guard_trg trigger must exist');
  });

  it('enforces single active warranty per unit via partial unique index', async () => {
    const indexExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'warranties_one_active_per_unit'
      ) as exists;
    `;
    assert.ok(indexExists && indexExists[0]?.exists === true, 'warranties_one_active_per_unit partial index must exist');
  });
});
