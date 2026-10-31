import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { getProjectProfitabilityList } from '@/services/analytics';
import { formatPaise } from '@/lib/money';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const period = (url.searchParams.get('period') as any) || 'THIS_MONTH';
    const isLossOnly = url.searchParams.get('isLossOnly') === 'true';

    const projects = await getProjectProfitabilityList({
      period,
      isLossOnly,
      limit: 1000,
    });

    const headers = [
      'Order Number',
      'Customer Name',
      'Revenue (Paise)',
      'Revenue (INR)',
      'Cost (Paise)',
      'Profit (Paise)',
      'Margin %',
      'Status',
      'Is Loss',
    ];

    const rows = projects.map((p) => {
      const totalCostPaise = p.materialsPaise + p.labourPaise + p.expensesPaise;
      return [
        `"${p.orderNumber}"`,
        `"${(p.customerName || '').replace(/"/g, '""')}"`,
        `"${p.netRevenuePaise}"`,
        `"${formatPaise(p.netRevenuePaise).replace(/₹\s?/, 'Rs. ')}"`,
        `"${totalCostPaise}"`,
        `"${p.installProfitPaise}"`,
        `"${p.marginPercent}%"`,
        `"${p.status}"`,
        `"${p.isLoss ? 'YES' : 'NO'}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="solaros-analytics-${period.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }
);

