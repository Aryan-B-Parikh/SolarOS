import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { listPurchaseOrders, createPurchaseOrder } from '@/services/purchasing';
import { z } from 'zod';

const CreatePOSchema = z.object({
  supplierId: z.string().uuid(),
  orderedOn: z.string().optional(),
  expectedOn: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      qtyOrdered: z.number().positive(),
      unitCostPaise: z.number().positive(),
    })
  ).min(1, 'At least 1 line item is required'),
});

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'SALES'],
  },
  async () => {
    const orders = await listPurchaseOrders();
    return NextResponse.json(orders);
  }
);

export const POST = createApiHandler(
  {
    bodySchema: CreatePOSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ body, user }) => {
    const po = await createPurchaseOrder(body, user?.id);
    return NextResponse.json(po, { status: 201 });
  }
);
