import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import prisma from '@/lib/db';
import { formatDateIST } from '@/lib/dates';
import { formatPaise } from '@/lib/money';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES'],
  },
  async () => {
    const orders = await prisma.order.findMany({
      include: { customer: true },
      orderBy: { created_at: 'desc' },
      take: 1000,
    });

    const headers = [
      'Order Number',
      'Customer Name',
      'Customer Phone',
      'Status',
      'Capacity (kW)',
      'System Type',
      'Subtotal (Paise)',
      'Total (Paise)',
      'Total (INR)',
      'Paid (Paise)',
      'Created Date',
      'Confirmed Date',
    ];

    const rows = orders.map((o) => [
      `"${o.order_number}"`,
      `"${(o.customer?.name || '').replace(/"/g, '""')}"`,
      `"${o.customer?.phone || ''}"`,
      `"${o.status}"`,
      `"${o.capacity_kw}"`,
      `"${o.system_type}"`,
      `"${o.subtotal_paise}"`,
      `"${o.total_paise}"`,
      `"${formatPaise(o.total_paise).replace(/₹\s?/, 'Rs. ')}"`,
      `"${o.paid_paise}"`,
      `"${formatDateIST(o.created_at)}"`,
      `"${o.confirmed_at ? formatDateIST(o.confirmed_at) : ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="solaros-orders-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }
);

