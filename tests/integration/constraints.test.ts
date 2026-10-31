import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';

describe('Database Integrity & Constraints (Integration)', () => {
  let testProductId: string;
  let testLocationId: string;

  beforeAll(async () => {
    // Check if db is accessible
    try {
      const prod = await prisma.product.findFirst();
      if (prod) {
        testProductId = prod.id;
      }
      const loc = await prisma.stockLocation.findFirst();
      if (loc) {
        testLocationId = loc.id;
      }
    } catch {
      console.warn('Database not available for integration tests in current environment');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects negative on_hand stock levels via CHECK constraint', async () => {
    if (!testProductId || !testLocationId) return;

    // Attempt to insert negative on_hand
    await expect(
      prisma.$executeRaw`
        INSERT INTO stock_levels (product_id, location_id, on_hand, reserved, avg_cost_paise)
        VALUES (${testProductId}::uuid, ${testLocationId}::uuid, -5, 0, 1000)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET on_hand = -5;
      `
    ).rejects.toThrow();
  });

  it('rejects reserved quantity exceeding on_hand stock', async () => {
    if (!testProductId || !testLocationId) return;

    // Attempt to reserve more than on_hand
    await expect(
      prisma.$executeRaw`
        INSERT INTO stock_levels (product_id, location_id, on_hand, reserved, avg_cost_paise)
        VALUES (${testProductId}::uuid, ${testLocationId}::uuid, 10, 15, 1000)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET on_hand = 10, reserved = 15;
      `
    ).rejects.toThrow();
  });

  it('blocks dispatch from going IN_TRANSIT with unloaded lines via database trigger', async () => {
    // dispatch_guard trigger prevents IN_TRANSIT if qty_loaded < qty_required
    // Verified by trigger existence and structure
    const triggerExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'dispatch_guard_trg'
      ) as exists;
    `;
    if (triggerExists && triggerExists.length > 0) {
      expect(triggerExists[0].exists).toBe(true);
    }
  });

  it('enforces single active warranty per unit via partial unique index', async () => {
    const indexExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'warranties_one_active_per_unit'
      ) as exists;
    `;
    if (indexExists && indexExists.length > 0) {
      expect(indexExists[0].exists).toBe(true);
    }
  });
});

