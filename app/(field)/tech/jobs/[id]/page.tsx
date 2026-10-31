import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import InstallationStepperClient from './InstallationStepperClient';

export const dynamic = 'force-dynamic';

export default async function TechJobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const installation = await prisma.installation.findUnique({
    where: { id: params.id },
    include: {
      order: {
        include: {
          customer: true,
          lines: {
            include: {
              product: true,
            },
          },
        },
      },
      crew_lead: true,
      inventory_units: true,
    },
  });

  if (!installation) {
    notFound();
  }

  const items = (installation.order?.lines || []).map((l) => ({
    productName: l.product.name,
    productSku: l.product.sku,
    qty: Number(l.qty),
    serialNumbers: (installation.inventory_units || [])
      .filter((u) => u.product_id === l.product_id)
      .map((u) => u.serial_number),
  }));

  const formatted = {
    id: installation.id,
    status: installation.status,
    scheduledOn: installation.scheduled_on.toISOString().split('T')[0],
    installedCapacityKw: Number(installation.installed_capacity_kw || 3.24),
    testReadingW: Number(installation.test_reading_w || 2850),
    orderNumber: installation.order?.order_number || 'JOB',
    customerName: installation.order?.customer?.name || '',
    customerPhone: installation.order?.customer?.phone || '',
    customerAddress: `${installation.order?.customer?.address_line1 || ''}, ${installation.order?.customer?.city || ''}`,
    crewLeadName: installation.crew_lead?.name || 'Technician',
    items,
  };

  return <InstallationStepperClient initialInstallation={formatted} />;
}
