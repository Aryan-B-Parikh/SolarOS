import React from 'react';
import { getProjectProfitabilityList, getKpiMetrics, getRevenueTrend } from '@/services/analytics';
import Link from 'next/link';
import { 
  BarChart3, TrendingUp, TrendingDown, DollarSign, 
  ArrowUpRight, Award, ShieldAlert, Download, Layers 
} from 'lucide-react';
import { MoneyText } from '@/components/MoneyText';
import { KpiTile } from '@/components/KpiTile';
import { TrendChart } from '@/components/TrendChart';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

/** Formats the margin delta in basis points, e.g. "+120 bp" or "-45 bp". */
function kpisDeltaLabel(kpis: Awaited<ReturnType<typeof getKpiMetrics>>): string {
  const deltaBp = kpis.margin.deltaBp;
  return `${deltaBp >= 0 ? '+' : ''}${deltaBp} bp`;
}

export default async function AnalyticsPage() {
  const [projectProfits, kpiSummary, revenueTrend] = await Promise.all([
    getProjectProfitabilityList(),
    getKpiMetrics('THIS_MONTH'),
    getRevenueTrend(6),
  ]);

  const totalRevenue = BigInt(kpiSummary.revenue.valuePaise);
  const totalProfit = BigInt(kpiSummary.grossProfit.valuePaise);
  const avgMargin = kpiSummary.margin.marginPercent;

  const topJobs = [...projectProfits].sort((a, b) => Number(b.installProfitPaise - a.installProfitPaise)).slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            <span>Financial Analytics & Profit Margins</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Revenue trends, job-level unit economics, material costs, and margin analysis across all projects.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs"
        >
          ← Back to Director Dashboard
        </Link>
      </div>

      {/* KPI Tiles - real period-over-period deltas from the profit engine */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile
          label="Net Project Revenue"
          value={<MoneyText paise={totalRevenue} className="text-slate-900" />}
          changePercent={kpiSummary.revenue.percentChange}
          changeLabel="vs last month"
        />
        <KpiTile
          label="Total Realized Gross Profit"
          value={<MoneyText paise={totalProfit} className="text-blue-700" />}
          changePercent={kpiSummary.grossProfit.percentChange}
          changeLabel="vs last month"
        />
        <KpiTile
          label="Blended Gross Margin"
          value={<span className="text-emerald-700">{avgMargin}%</span>}
          helpText={`Prior period: ${kpiSummary.margin.priorMarginPercent} (${kpisDeltaLabel(kpiSummary)})`}
        />
      </div>

      {/* Revenue Trend Chart (FR-8.9) - real v_revenue_trend data */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span>Revenue Trend - Last 6 Months (FR-8.9)</span>
          </h2>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-blue-600" /> Net Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-emerald-600" /> Gross Profit
            </span>
          </div>
        </div>
        {revenueTrend.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">No revenue data recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TrendChart
              title="Net Revenue"
              data={revenueTrend.map((m) => ({ label: m.label, valuePaise: m.revenuePaise }))}
              color="#2563eb"
            />
            <TrendChart
              title="Gross Profit"
              data={revenueTrend.map((m) => ({ label: m.label, valuePaise: m.grossProfitPaise }))}
              color="#059669"
            />
          </div>
        )}
      </div>

      {/* Top Profit Jobs Table (FR-8.9) */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span>Top Performing Projects (Highest Absolute Profit)</span>
          </h2>
          <span className="text-xs text-slate-400">Ranked by net installation profit</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Rank</th>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">System Size</th>
                <th className="px-3 py-2.5 text-right">Net Revenue</th>
                <th className="px-3 py-2.5 text-right font-bold">Install Profit</th>
                <th className="px-3 py-2.5 text-right">Gross Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {topJobs.map((job, idx) => (
                <tr key={job.orderId} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-bold text-slate-400">#{idx + 1}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                    <Link href={`/orders/${job.orderId}`}>{job.orderNumber}</Link>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{job.customerName}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{job.status}</td>
                  <td className="px-3 py-2.5 text-right">
                    <MoneyText paise={job.netRevenuePaise} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                    <MoneyText paise={job.installProfitPaise} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                    {job.marginPercent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Project Profitability Matrix */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>Complete Projects Unit Economics & Cost Analysis</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5 text-right">Net Revenue</th>
                <th className="px-3 py-2.5 text-right">Materials</th>
                <th className="px-3 py-2.5 text-right">Labour</th>
                <th className="px-3 py-2.5 text-right">Expenses</th>
                <th className="px-3 py-2.5 text-right font-bold">Install Profit</th>
                <th className="px-3 py-2.5 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {projectProfits.map((p) => (
                <tr key={p.orderId} className={clsx('hover:bg-slate-50', p.isLoss && 'bg-red-50/60 font-semibold')}>
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                    <Link href={`/orders/${p.orderId}`}>{p.orderNumber}</Link>
                  </td>
                  <td className="px-3 py-2.5 font-medium">{p.customerName}</td>
                  <td className="px-3 py-2.5 text-right">
                    <MoneyText paise={p.netRevenuePaise} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    <MoneyText paise={p.materialsPaise} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    <MoneyText paise={p.labourPaise} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    <MoneyText paise={p.expensesPaise} />
                  </td>
                  <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLoss ? 'text-red-700' : 'text-emerald-700')}>
                    <MoneyText paise={p.installProfitPaise} />
                  </td>
                  <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLoss ? 'text-red-700' : 'text-slate-800')}>
                    {p.marginPercent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

