import React from 'react';
import { prisma } from '@/lib/db';
import ReceiveStockClient from './ReceiveStockClient';

export const dynamic = 'force-dynamic';

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: { poId?: string };
}) {
  const [products, locations, purchaseOrders] = await Promise.all([
    prisma.product.findMany({
      where: { is_active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        is_serialized: true,
        uom: true,
        warranty_months: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.stockLocation.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['OPEN', 'PARTIAL'] },
      },
      include: {
        supplier: {
          select: { name: true },
        },
        lines: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                is_serialized: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
  ]);

  const formattedPos = purchaseOrders.map((po) => ({
    id: po.id,
    poNumber: po.po_number,
    supplierName: po.supplier.name,
    status: po.status,
    lines: po.lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product.name,
      productSku: l.product.sku,
      qtyOrdered: Number(l.qty_ordered),
      qtyReceived: Number(l.qty_received),
      unitCostPaise: Number(l.unit_cost_paise),
      isSerialized: l.product.is_serialized,
    })),
  }));

  return (
    <ReceiveStockClient
      products={products}
      locations={locations}
      purchaseOrders={formattedPos}
      prefilledPoId={searchParams.poId}
    />
  );
}
