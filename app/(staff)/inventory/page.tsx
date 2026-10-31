import React from 'react';
import { prisma } from '@/lib/db';
import InventoryClient from './InventoryClient';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const [stockLevels, products, locations] = await Promise.all([
    prisma.stockLevel.findMany({
      include: {
        product: true,
        location: true,
      },
      orderBy: { product: { category: 'asc' } },
    }),
    prisma.product.findMany({
      where: { is_active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        uom: true,
        is_serialized: true,
        reorder_level: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.stockLocation.findMany({
      where: { is_active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const stock = stockLevels.map((s) => {
    const onHand = Number(s.on_hand);
    const reserved = Number(s.reserved);
    const available = onHand - reserved;
    const reorder = Number(s.product.reorder_level);
    return {
      productId: s.product_id,
      sku: s.product.sku,
      name: s.product.name,
      category: s.product.category,
      uom: s.product.uom,
      isSerialized: s.product.is_serialized,
      locationId: s.location_id,
      locationName: s.location.name,
      onHand,
      reserved,
      available,
      reorderLevel: reorder,
      isLowStock: available <= reorder,
    };
  });

  return (
    <InventoryClient
      stock={stock}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        uom: p.uom,
        isSerialized: p.is_serialized,
        reorderLevel: Number(p.reorder_level),
      }))}
      locations={locations}
    />
  );
}
