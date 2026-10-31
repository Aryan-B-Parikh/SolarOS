import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { createDraftPOForLowStock } from '@/services/purchasing';

const LowStockDraftSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, 'At least one product id is required'),
});

/**
 * Creates a DRAFT purchase order restocking low-stock products (FR-5.8 / FR-5.3).
 * Line qty heuristic: reorder_level * 2 - available; unit cost = std cost.
 * The first active supplier is attached as a placeholder for review.
 */
export const POST = createApiHandler(
  {
    bodySchema: LowStockDraftSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ body, user }) => {
    const result = await createDraftPOForLowStock(body.productIds, user?.id);
    return NextResponse.json(result, { status: 201 });
  }
);
