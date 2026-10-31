import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { receiveGoods } from '@/services/purchasing';
import { ReceiveGoodsSchema } from '@/contracts';

export const POST = createApiHandler(
  {
    bodySchema: ReceiveGoodsSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ body, user }) => {
    const result = await receiveGoods({
      receiptNumber: body.receiptNumber,
      supplierId: body.supplierId,
      poId: body.poId,
      supplierInvoiceRef: body.supplierInvoiceRef,
      locationId: body.locationId,
      receivedOn: body.receivedOn,
      lines: body.lines,
      actorId: user?.id,
    });

    return NextResponse.json(result);
  }
);

