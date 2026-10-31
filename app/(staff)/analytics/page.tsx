import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { 
  BarChart3, TrendingUp, TrendingDown, DollarSign, 
  ArrowUpRight, Award, ShieldAlert, Download, Layers 
} from 'lucide-react';
import { MoneyText } from '@/components/MoneyText';
import { KpiTile } from '@/components/KpiTile';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const [orders, payments, expenses] = await Promise.all([
    prisma.order.findMany({
      include: {
        customer: true,
        expenses: true,
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.payment.findMany(),
    prisma.expense.findMany(),
  ]);

  const projectProfits = orders.map((o) => {
    const netRevenue = o.subtotal_paise - o.discount_paise;
    const materials = BigInt(Math.round(Number(netRevenue) * 0.62));
    const labour = BigInt(Math.round(Number(netRevenue) * 0.08));
    const exp = (o.expenses || []).reduce((acc: bigint, e: any) => acc + BigInt(e.amount_paise), 0n);
    const installProfit = netRevenue - materials - labour - exp;
    const marginPercent = netRevenue > 0n ? Number((Number(installProfit) / Number(netRevenue)) * 100).toFixed(1) : '0';

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      customerName: o.customer.name,
      capacityKw: o.capacity_kw,
      systemType: o.system_type,
      netRevenue,
      materials,
      labour,
      expenses: exp,
      installProfit,
      marginPercent,
      isLoss: installProfit < 0n,
    };
  });

  const totalRevenue = projectProfits.reduce((acc, p) => acc + p.netRevenue, 0n);
  const totalProfit = projectProfits.reduce((acc, p) => acc + p.installProfit, 0n);
  const avgMargin = totalRevenue > 0n ? ((Number(totalProfit) / Number(totalRevenue)) * 100).toFixed(1) : '0';

  const topJobs = [...projectProfits].sort((a, b) => Number(b.installProfit) - Number(a.installProfit)).slice(0, 5);

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

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile
          label="Net Project Revenue"
          value={<MoneyText paise={totalRevenue} className="text-slate-900" />}
          changePercent={18.4}
        />
        <KpiTile
          label="Total Realized Gross Profit"
          value={<MoneyText paise={totalProfit} className="text-blue-700" />}
          changePercent={22.1}
        />
        <KpiTile
          label="Blended Gross Margin"
          value={<span className="text-emerald-700">{avgMargin}%</span>}
          helpText="Target benchmark: 20.0%"
        />
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
                  <td className="px-3 py-2.5 font-semibold">{job.capacityKw} kW {job.systemType}</td>
                  <td className="px-3 py-2.5 text-right">
                    <MoneyText paise={job.netRevenue} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                    <MoneyText paise={job.installProfit} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                    {job.marginPercent}%
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
                    <MoneyText paise={p.netRevenue} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    <MoneyText paise={p.materials} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    <MoneyText paise={p.labour} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    <MoneyText paise={p.expenses} />
                  </td>
                  <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLoss ? 'text-red-700' : 'text-emerald-700')}>
                    <MoneyText paise={p.installProfit} />
                  </td>
                  <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLoss ? 'text-red-700' : 'text-slate-800')}>
                    {p.marginPercent}%
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

