import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { adjustStock } from '@/services/inventory';
import { AdjustStockSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: AdjustStockSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ body, user }) => {
    const result = await adjustStock({
      productId: body.productId,
      locationId: body.locationId,
      qtyDelta: body.qtyDelta,
      reason: body.reason,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

