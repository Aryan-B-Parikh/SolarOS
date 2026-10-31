import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { getKpiMetrics, getProjectProfitabilityList } from '@/services/analytics';
import { getCompanyBranding } from '@/services/settings';
import { formatDateIST } from '@/lib/dates';
import {
  createPdfDocument,
  drawTable,
  drawTotals,
  drawSection,
  inr,
  pdfResponseHeaders,
} from '@/lib/pdf';

const ExportPdfQuerySchema = z.object({
  period: z.enum(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM']).default('THIS_MONTH'),
  customStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const PERIOD_LABEL: Record<string, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
  CUSTOM: 'Custom Range',
};

/**
 * GET /api/v1/analytics/export/pdf?period=... (FR-8.6)
 * Branded executive KPI report generated server-side via src/lib/pdf.ts.
 */
export const GET = createApiHandler(
  {
    querySchema: ExportPdfQuerySchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ query }) => {
    const period = query.period || 'THIS_MONTH';

    const [kpis, projects, company] = await Promise.all([
      getKpiMetrics(period, query.customStart, query.customEnd),
      getProjectProfitabilityList({ limit: 25 }),
      getCompanyBranding(),
    ]);

    const { doc, finish } = createPdfDocument({
      title: `Executive KPI Report - ${PERIOD_LABEL[period] || period}`,
      company: {
        companyName: company.companyName,
        companyAddress: company.companyAddress,
        companyGstin: company.companyGstin,
        companyPhone: company.companyPhone,
        companyEmail: company.companyEmail,
      },
      metaLines: [
        ['Period', `${formatDateIST(kpis.dateRange.start)} - ${formatDateIST(kpis.dateRange.end)}`],
        ['Generated', formatDateIST(new Date())],
        ['Orders in period', String(kpis.counts.ordersCount)],
      ],
    });

    // ── KPI summary table ───────────────────────────────────────────────────
    const pct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;
    drawTable(
      doc,
      [
        { key: 'metric', header: 'Metric', width: 150 },
        { key: 'value', header: 'Value', width: 115, align: 'right' },
        { key: 'prior', header: 'Prior Period', width: 115, align: 'right' },
        { key: 'change', header: 'Change', width: 119, align: 'right' },
      ],
      [
        {
          metric: 'Net Revenue',
          value: inr(kpis.revenue.valuePaise),
          prior: inr(kpis.revenue.priorValuePaise),
          change: pct(kpis.revenue.percentChange),
        },
        {
          metric: 'Cash Collections',
          value: inr(kpis.collections.valuePaise),
          prior: inr(kpis.collections.priorValuePaise),
          change: pct(kpis.collections.percentChange),
        },
        {
          metric: 'Total Expenses',
          value: inr(kpis.expenses.valuePaise),
          prior: inr(kpis.expenses.priorValuePaise),
          change: pct(kpis.expenses.percentChange),
        },
        {
          metric: 'Gross Profit',
          value: inr(kpis.grossProfit.valuePaise),
          prior: inr(kpis.grossProfit.priorValuePaise),
          change: pct(kpis.grossProfit.percentChange),
        },
        {
          metric: 'Gross Margin (bp)',
          value: `${kpis.margin.marginBp} bp (${kpis.margin.marginPercent})`,
          prior: `${kpis.margin.priorMarginBp} bp (${kpis.margin.priorMarginPercent})`,
          change: `${kpis.margin.deltaBp >= 0 ? '+' : ''}${kpis.margin.deltaBp} bp`,
        },
      ]
    );

    // ── Operational counts ──────────────────────────────────────────────────
    let y = drawSection(doc, 'Operational Snapshot', [
      `Pending workflow steps (leads + orders + tickets): ${kpis.counts.pendingStepsCount}`,
      `Open service tickets: ${kpis.counts.openTicketsCount}`,
      `Low-stock products (at or below reorder level): ${kpis.counts.lowStockCount}`,
      `Loss-making jobs in period: ${kpis.counts.lossMakingCount}`,
    ]);

    // ── Project profitability table ────────────────────────────────────────
    if (projects.length > 0) {
      y = drawSection(doc, 'Project Profitability (Top 25 by recency)', [], y + 6);
      drawTable(
        doc,
        [
          { key: 'order', header: 'Order', width: 105 },
          { key: 'customer', header: 'Customer', width: 130 },
          { key: 'net', header: 'Net Revenue', width: 90, align: 'right' },
          { key: 'profit', header: 'Install Profit', width: 90, align: 'right' },
          { key: 'margin', header: 'Margin', width: 84, align: 'right' },
        ],
        projects.map((p) => ({
          order: p.orderNumber,
          customer: p.customerName || 'Customer',
          net: inr(p.netRevenuePaise),
          profit: inr(p.installProfitPaise),
          margin: p.marginPercent,
        })),
        { startY: y }
      );
    }

    drawTotals(
      doc,
      [
        { label: `Net Revenue (${PERIOD_LABEL[period] || period})`, value: inr(kpis.revenue.valuePaise) },
        { label: 'Gross Profit', value: inr(kpis.grossProfit.valuePaise), bold: true, accent: true },
      ],
      y + 10
    );

    const buffer = await finish();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: pdfResponseHeaders(`sunpower-kpi-${period.toLowerCase()}.pdf`),
    });
  }
);
