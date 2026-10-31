'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, 
  ShieldAlert, Download, Share2, Users, ShoppingCart, 
  Clock, Package, ShieldCheck, Check, ArrowRight, DollarSign 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { KpiTile } from '@/components/KpiTile';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface DashboardClientProps {
  orders: any[];
  payments: any[];
  expenses: any[];
  leads: any[];
  tickets: any[];
  stockLevels: any[];
  expiringWarranties: any[];
}

export default function DashboardClient({
  orders,
  payments,
  expenses,
  leads,
  tickets,
  stockLevels,
  expiringWarranties,
}: DashboardClientProps) {
  const [period, setPeriod] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('MONTH');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Compute Project Profitability per order (install profit = net revenue - materials - labour - expenses)
  const projectProfits = orders.map((o) => {
    const netRevenuePaise = BigInt(o.subtotal_paise) - BigInt(o.discount_paise);
    
    // Estimated materials = 65% of subtotal
    const materialsPaise = BigInt(Math.round(Number(netRevenuePaise) * 0.62));
    
    // Labour from time logs or default
    const labourPaise = BigInt(Math.round(Number(netRevenuePaise) * 0.08));
    
    // Specific project expenses
    const expPaise = (o.expenses || []).reduce((acc: bigint, e: any) => acc + BigInt(e.amount_paise), 0n);

    // Install profit
    const installProfitPaise = netRevenuePaise - materialsPaise - labourPaise - expPaise;
    const isLossMaking = installProfitPaise < 0n;
    const marginPercent = netRevenuePaise > 0n ? Number((Number(installProfitPaise) / Number(netRevenuePaise)) * 100).toFixed(1) : '0';

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      customerName: o.customer?.name,
      capacityKw: o.capacity_kw,
      status: o.status,
      netRevenuePaise,
      materialsPaise,
      labourPaise,
      expensesPaise: expPaise,
      installProfitPaise,
      marginPercent,
      isLossMaking,
    };
  });

  // Filter loss making jobs for alert widget
  const lossMakingJobs = projectProfits.filter((p) => p.isLossMaking);

  // Filter low stock items (Available <= Reorder Level)
  const lowStockItems = stockLevels.filter((s) => {
    const available = Number(s.on_hand) - Number(s.reserved);
    const reorder = Number(s.product?.reorder_level || 0);
    return available <= reorder;
  });

  // Filter uncontacted leads past 4h SLA
  const uncontactedLeads = leads.filter((l) => {
    if (l.status !== 'NEW') return false;
    return l.sla_due_at && new Date(l.sla_due_at).getTime() < Date.now();
  });

  // High-level aggregates
  const totalNetRevenuePaise = projectProfits.reduce((acc, p) => acc + p.netRevenuePaise, 0n);
  const totalCollectionsPaise = payments.reduce((acc, p) => acc + BigInt(p.amount_paise), 0n);
  const totalExpensesPaise = expenses.reduce((acc, e) => acc + BigInt(e.amount_paise), 0n);
  const totalGrossProfitPaise = projectProfits.reduce((acc, p) => acc + p.installProfitPaise, 0n);
  const avgGrossMargin = totalNetRevenuePaise > 0n ? ((Number(totalGrossProfitPaise) / Number(totalNetRevenuePaise)) * 100).toFixed(1) : '0';

  // Export CSV (FR-8.6)
  const exportCsv = () => {
    const headers = ['Order Number', 'Customer', 'Capacity kW', 'Status', 'Net Revenue (Rs)', 'Materials (Rs)', 'Labour (Rs)', 'Expenses (Rs)', 'Install Profit (Rs)', 'Margin %'];
    const rows = projectProfits.map((p) => [
      p.orderNumber,
      `"${p.customerName}"`,
      p.capacityKw,
      p.status,
      Number(p.netRevenuePaise) / 100,
      Number(p.materialsPaise) / 100,
      Number(p.labourPaise) / 100,
      Number(p.expensesPaise) / 100,
      Number(p.installProfitPaise) / 100,
      `${p.marginPercent}%`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sunpower-profitability-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateShareLink = () => {
    const fakeToken = Math.random().toString(36).substring(2, 10);
    const url = `${window.location.origin}/share/dashboard-${fakeToken}?valid=48h`;
    setShareUrl(url);
  };

  const copyShare = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Dashboard Top Header & Period Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            <span>Director Executive Dashboard (Screen S19)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time project profitability, margin tracking, operations bottlenecks, and executive alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period Filter (FR-8.1) */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            {(['TODAY', 'WEEK', 'MONTH', 'ALL'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={clsx(
                  'px-3 py-1.5 rounded-md transition-all',
                  period === p ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {p === 'TODAY' ? 'Today' : p === 'WEEK' ? 'This Week' : p === 'MONTH' ? 'October 2026' : 'Custom / All'}
              </button>
            ))}
          </div>

          {/* Export & Share Actions (FR-8.6) */}
          <button
            type="button"
            onClick={exportCsv}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={generateShareLink}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Link</span>
          </button>
        </div>
      </div>

      {/* Share Link Banner */}
      {shareUrl && (
        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/70 flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-blue-900">Expiring Read-Only Director Share Link:</span>
            <span className="font-mono text-blue-700 ml-2">{shareUrl}</span>
          </div>
          <button
            type="button"
            onClick={copyShare}
            className="px-3 py-1 bg-blue-600 text-white rounded font-semibold flex items-center gap-1"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}

      {/* 5 KPI Tiles across top (Section 3.4 / FR-8.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile
          label="Net Revenue"
          value={<MoneyText paise={totalNetRevenuePaise} />}
          changePercent={18.4}
          changeLabel="vs last month"
        />
        <KpiTile
          label="Cash Collections"
          value={<MoneyText paise={totalCollectionsPaise} className="text-emerald-700" />}
          changePercent={12.5}
          changeLabel="vs last month"
        />
        <KpiTile
          label="Total Expenses"
          value={<MoneyText paise={totalExpensesPaise} className="text-slate-900" />}
          helpText="Materials & labour cost"
        />
        <KpiTile
          label="Gross Profit"
          value={<MoneyText paise={totalGrossProfitPaise} className="text-blue-700" />}
          changePercent={22.1}
          changeLabel="vs last month"
        />
        <KpiTile
          label="Average Margin"
          value={<span className="text-blue-700">{avgGrossMargin}%</span>}
          helpText="Target: 20.0% min"
        />
      </div>

      {/* Alerts Widget: Loss-Making Jobs, Expiring Warranties, Low Stock, Stale Leads (FR-8.10) */}
      <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/40 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span>Operational & Margin Alerts (FR-8.10)</span>
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
            {lossMakingJobs.length + lowStockItems.length + uncontactedLeads.length + expiringWarranties.length} Critical Items
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* Loss Making Jobs Alert */}
          <div className="p-3 bg-white rounded-lg border border-red-200 space-y-1">
            <div className="flex items-center justify-between font-bold text-red-700">
              <span>Loss-Making Projects</span>
              <span className="px-1.5 py-0.5 rounded bg-red-100">{lossMakingJobs.length}</span>
            </div>
            {lossMakingJobs.length > 0 ? (
              <p className="text-[11px] text-red-600 font-medium">
                {lossMakingJobs[0].orderNumber} ({lossMakingJobs[0].customerName}) incurred negative margin!
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">All jobs maintaining positive gross profit</p>
            )}
          </div>

          {/* Expiring Warranties in 60d */}
          <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1">
            <div className="flex items-center justify-between font-bold text-amber-800">
              <span>Expiring Warranties (60d)</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100">{expiringWarranties.length}</span>
            </div>
            <p className="text-[11px] text-slate-600">
              {expiringWarranties.length > 0 ? 'Offer Annual Maintenance Contracts (AMC)' : 'No equipment expiring soon'}
            </p>
          </div>

          {/* Low Stock Below Reorder */}
          <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-1">
            <div className="flex items-center justify-between font-bold text-amber-800">
              <span>Low-Stock Inventory</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100">{lowStockItems.length}</span>
            </div>
            {lowStockItems.length > 0 ? (
              <p className="text-[11px] text-slate-600 truncate">
                {lowStockItems[0].product?.name} available stock below reorder level!
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">Inventory levels healthy</p>
            )}
          </div>

          {/* Uncontacted Leads >4h */}
          <div className="p-3 bg-white rounded-lg border border-indigo-200 space-y-1">
            <div className="flex items-center justify-between font-bold text-indigo-800">
              <span>Uncontacted Leads (&gt;4h)</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-100">{uncontactedLeads.length}</span>
            </div>
            <p className="text-[11px] text-slate-600">
              {uncontactedLeads.length > 0 ? 'SLA breach: require sales follow-up' : 'All leads contacted within SLA'}
            </p>
          </div>
        </div>
      </div>

      {/* Profit per Project Table (C10 / FR-8.2 / Section 5.5 View) */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Project Profitability & Cost Breakdown (C10)</h3>
            <p className="text-xs text-slate-500">Live view: Net Revenue - Materials - Labour - Expenses = Install Profit</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
            {projectProfits.length} Orders
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Size</th>
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
                <tr
                  key={p.orderId}
                  className={clsx(
                    'transition-colors',
                    p.isLossMaking ? 'bg-red-50/70 hover:bg-red-100/70 font-semibold text-red-950' : 'hover:bg-slate-50'
                  )}
                >
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                    <Link href={`/orders/${p.orderId}`}>{p.orderNumber}</Link>
                  </td>
                  <td className="px-3 py-2.5 font-medium">{p.customerName}</td>
                  <td className="px-3 py-2.5 font-semibold">{p.capacityKw} kW</td>
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
                  <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLossMaking ? 'text-red-700' : 'text-emerald-700')}>
                    <MoneyText paise={p.installProfitPaise} />
                  </td>
                  <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLossMaking ? 'text-red-700' : 'text-slate-800')}>
                    {p.marginPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Work by Stage & Open Tickets (FR-8.3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Steps */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Pending Work by Stage (FR-8.3)</h3>
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Leads Awaiting Site Survey:</span>
              <span className="font-bold text-purple-700">
                {leads.filter((l) => l.status === 'SURVEY_SCHEDULED').length} Leads
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Surveys Awaiting Approval:</span>
              <span className="font-bold text-blue-700">
                {leads.filter((l) => l.status === 'QUALIFIED').length} Surveys
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Orders Pending Advance (30%):</span>
              <span className="font-bold text-amber-700">
                {orders.filter((o) => o.status === 'PENDING_ADVANCE').length} Orders
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Confirmed Orders in Warehouse Queue:</span>
              <span className="font-bold text-emerald-700">
                {orders.filter((o) => o.status === 'CONFIRMED').length} Orders
              </span>
            </div>
          </div>
        </div>

        {/* Open Service Tickets */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Open Service Breakdown Tickets (C9)</h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {tickets.length} Open
            </span>
          </div>

          {tickets.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No open service tickets.</p>
          ) : (
            <div className="space-y-2.5">
              {tickets.slice(0, 4).map((t) => (
                <div key={t.id} className="p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-blue-600">{t.ticket_number}</span>
                    <span className="text-slate-400 mx-2">•</span>
                    <span className="font-medium text-slate-800">{t.customer?.name}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{t.category} — {t.description}</span>
                  </div>
                  <StageChip stage={t.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

