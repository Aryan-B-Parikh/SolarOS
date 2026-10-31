import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import UnitDrilldownClient from './UnitDrilldownClient';

export const dynamic = 'force-dynamic';

export default async function UnitDrilldownPage({
  params,
}: {
  params: { sku: string };
}) {
  const decodedSku = decodeURIComponent(params.sku);

  const product = await prisma.product.findUnique({
    where: { sku: decodedSku },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      brand: true,
      model: true,
      uom: true,
      is_serialized: true,
      reorder_level: true,
    },
  });

  if (!product) {
    notFound();
  }

  const stockLevels = await prisma.stockLevel.findMany({
    where: { product_id: product.id },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  const units = await prisma.inventoryUnit.findMany({
    where: { product_id: product.id },
    include: {
      location: {
        select: {
          id: true,
          name: true,
        },
      },
      order: {
        select: {
          id: true,
          order_number: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  const formattedStockLevels = stockLevels.map((sl) => {
    const onHand = Number(sl.on_hand);
    const reserved = Number(sl.reserved);
    const available = Math.max(0, onHand - reserved);
    return {
      locationName: sl.location.name,
      locationCode: sl.location.code,
      onHand,
      reserved,
      available,
    };
  });

  const formattedUnits = units.map((u) => ({
    id: u.id,
    serial_number: u.serial_number,
    qr_code: u.qr_code,
    status: u.status,
    unit_cost_paise: Number(u.unit_cost_paise),
    delivered_on: u.delivered_on ? u.delivered_on.toISOString() : null,
    location: {
      id: u.location.id,
      name: u.location.name,
    },
    order: u.order ? { id: u.order.id, order_number: u.order.order_number } : null,
    customer: u.customer ? { id: u.customer.id, name: u.customer.name, phone: u.customer.phone } : null,
    created_at: u.created_at.toISOString(),
  }));

  return (
    <UnitDrilldownClient
      product={{
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        brand: product.brand,
        model: product.model,
        uom: product.uom,
        is_serialized: product.is_serialized,
        reorder_level: Number(product.reorder_level),
      }}
      stockLevels={formattedStockLevels}
      units={formattedUnits}
    />
  );
}
