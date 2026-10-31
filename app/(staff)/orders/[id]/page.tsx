import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { getOrderById } from '@/services/orders';
import OrderDetailClient from './OrderDetailClient';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const order = await getOrderById(params.id);
    return <OrderDetailClient initialOrder={order as any} />;
  } catch (err) {
    notFound();
  }
}
