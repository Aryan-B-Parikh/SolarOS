'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3, AlertTriangle,
  Download, Share2, Check, FileDown, Loader2
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { KpiTile } from '@/components/KpiTile';
import clsx from 'clsx';

/**
 * Director Executive Dashboard (Screen S19, FR-8.1 / C10).
 *
 * All figures come from the server-side profit engine
 * (getAnalyticsSummary / getKpiMetrics / v_project_profitability) -
 * there are NO client-side estimates or hardcoded numbers. Switching the
 * period re-fetches `/api/v1/analytics/kpis?period=X` for the selected
 * window (with the server-rendered value as optimistic initial data).
 */

type AnalyticsPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';

interface KpiMetricDto {
  valuePaise: string;
  priorValuePaise: string;
  deltaPaise: string;
  percentChange: number;
  isPositive: boolean;
}

interface KpiSummaryDto {
  period: AnalyticsPeriod;
  dateRange: { start: string; end: string };
  revenue: KpiMetricDto;
  collections: KpiMetricDto;
  expenses: KpiMetricDto;
  grossProfit: KpiMetricDto;
  margin: {
    marginBp: number;
    marginPercent: string;
    priorMarginBp: number;
    priorMarginPercent: string;
    deltaBp: number;
  };
  counts: {
    ordersCount: number;
    pendingStepsCount: number;
    openTicketsCount: number;
    lowStockCount: number;
    lossMakingCount: number;
  };
}

interface AlertsDto {
  lossMakingJobs: Array<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    installProfitPaise: string;
    marginPercent: string;
  }>;
  expiringWarranties: Array<{
    warrantyId: string;
    serialNumber: string;
    productName: string;
    customerName: string;
    customerPhone: string;
    endDate: string;
    daysRemaining: number;
  }>;
  lowStockItems: Array<{
    productId: string;
    sku: string;
    productName: string;
    category: string;
    availableQty: number;
    reorderLevel: number;
  }>;
  uncontactedLeads: Array<{
    leadId: string;
    leadNumber: string;
    customerName: string;
    customerPhone: string;
    createdAt: string;
    hoursUncontacted: number;
  }>;
}

interface ProjectProfitDto {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  status: string;
  netRevenuePaise: string;
  materialsPaise: string;
  labourPaise: string;
  expensesPaise: string;
  installProfitPaise: string;
  marginPercent: string;
  isLoss: boolean;
}

interface TicketDto {
  id: string;
  ticket_number: string;
  category: string;
  description: string;
  status: string;
  customer?: { name?: string } | null;
}

interface DashboardClientProps {
  initialSummary: {
    today: KpiSummaryDto;
    thisWeek: KpiSummaryDto;
    thisMonth: KpiSummaryDto;
    alerts: AlertsDto;
  };
  projects: ProjectProfitDto[];
  tickets: TicketDto[];
  pendingSteps: {
    leadsAwaitingSurvey: number;
    surveysAwaitingReview: number;
    ordersPendingAdvance: number;
    ordersConfirmed: number;
  };
}

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
};

const PERIOD_CHANGE_LABELS: Record<AnalyticsPeriod, string> = {
  TODAY: 'vs yesterday',
  THIS_WEEK: 'vs last week',
  THIS_MONTH: 'vs last month',
};

const big = (v: string | number) => BigInt(v);

export default function DashboardClient({
  initialSummary,
  projects,
  tickets,
  pendingSteps,
}: DashboardClientProps) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('THIS_MONTH');
  const [summaryByPeriod, setSummaryByPeriod] = useState<Record<AnalyticsPeriod, KpiSummaryDto | null>>(
    {
      TODAY: initialSummary.today,
      THIS_WEEK: initialSummary.thisWeek,
      THIS_MONTH: initialSummary.thisMonth,
    }
  );
  const [alerts] = useState<AlertsDto>(initialSummary.alerts);
  const [loadingPeriod, setLoadingPeriod] = useState<AnalyticsPeriod | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeKpis = summaryByPeriod[period];

  // Re-fetch real KPIs whenever the period changes (FR-8.1). The
  // server-rendered seed keeps the first paint instant; every switch
  // re-queries the analytics API so the tiles stay fresh.
  const fetchKpis = useCallback(async (p: AnalyticsPeriod) => {
    setLoadingPeriod(p);
    setFetchError(null);
    try {
      const res = await fetch(`/api/v1/analytics/kpis?period=${p}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Failed to load ${p} KPIs`);
      }
      const data: KpiSummaryDto = await res.json();
      setSummaryByPeriod((prev) => ({ ...prev, [p]: data }));
    } catch (err: any) {
      setFetchError(err.message || 'Failed to refresh KPIs');
    } finally {
      setLoadingPeriod(null);
    }
  }, []);

  useEffect(() => {
    void fetchKpis(period);
  }, [period, fetchKpis]);

  // ── CSV export of the real profitability matrix (FR-8.6) ────────────────
  const exportCsv = () => {
    const headers = [
      'Order Number',
      'Customer',
      'Status',
      'Net Revenue (Rs)',
      'Materials (Rs)',
      'Labour (Rs)',
      'Expenses (Rs)',
      'Install Profit (Rs)',
      'Margin %',
    ];
    const rows = projects.map((p) => [
      p.orderNumber,
      `"${p.customerName || 'Customer'}"`,
      p.status,
      Number(p.netRevenuePaise) / 100,
      Number(p.materialsPaise) / 100,
      Number(p.labourPaise) / 100,
      Number(p.expensesPaise) / 100,
      Number(p.installProfitPaise) / 100,
      `${p.marginPercent}%`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sunpower-profitability-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Real expiring share link (FR-8.6) ───────────────────────────────────
  const generateShareLink = async () => {
    setShareLoading(true);
    try {
      const res = await fetch('/api/v1/analytics/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ period, durationHours: 48 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to create share link');
      }
      const data = await res.json();
      const url = `${window.location.origin}/shared/${data.token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard may be blocked; the banner still shows the URL for manual copy.
      }
    } catch (err: any) {
      alert(err.message || 'Error creating share link');
    } finally {
      setShareLoading(false);
    }
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lossMakingJobs = alerts.lossMakingJobs;
  const lowStockItems = alerts.lowStockItems;
  const uncontactedLeads = alerts.uncontactedLeads;
  const expiringWarranties = alerts.expiringWarranties;
  const alertCount =
    lossMakingJobs.length + lowStockItems.length + uncontactedLeads.length + expiringWarranties.length;

  const grossProfitTotal = useMemo(
    () => projects.reduce((acc, p) => acc + big(p.installProfitPaise), 0n),
    [projects]
  );

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
          {/* Period Filter (FR-8.1) - re-fetches real KPIs from the analytics API */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            {(Object.keys(PERIOD_LABELS) as AnalyticsPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={clsx(
                  'px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5',
                  period === p ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {loadingPeriod === p && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>{PERIOD_LABELS[p]}</span>
              </button>
            ))}
          </div>

          {/* Export & Share Actions (FR-8.6) */}
          <button
            type="button"
            onClick={exportCsv}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs"
            title="Export project profitability as CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <a
            href={`/api/v1/analytics/export/pdf?period=${period}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs"
            title="Download branded KPI report (PDF)"
          >
            <FileDown className="w-4 h-4" />
            <span>Export PDF</span>
          </a>

          <button
            type="button"
            onClick={generateShareLink}
            disabled={shareLoading}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs disabled:opacity-60"
          >
            {shareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            <span>Share Link</span>
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          {fetchError} - showing the freshest data available.
        </div>
      )}

      {/* Share Link Banner */}
      {shareUrl && (
        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/70 flex items-center justify-between text-xs">
          <div className="min-w-0">
            <span className="font-bold text-blue-900">Expiring Read-Only Director Share Link (48h):</span>
            <span className="font-mono text-blue-700 ml-2 break-all">{shareUrl}</span>
          </div>
          <button
            type="button"
            onClick={copyShare}
            className="px-3 py-1 bg-blue-600 text-white rounded font-semibold flex items-center gap-1 shrink-0 ml-3"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}

      {/* 5 KPI Tiles across top (Section 3.4 / FR-8.1) - real engine values */}
      {activeKpis ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiTile
            label="Net Revenue"
            value={<MoneyText paise={big(activeKpis.revenue.valuePaise)} />}
            changePercent={activeKpis.revenue.percentChange}
            changeLabel={PERIOD_CHANGE_LABELS[period]}
          />
          <KpiTile
            label="Cash Collections"
            value={<MoneyText paise={big(activeKpis.collections.valuePaise)} className="text-emerald-700" />}
            changePercent={activeKpis.collections.percentChange}
            changeLabel={PERIOD_CHANGE_LABELS[period]}
          />
          <KpiTile
            label="Total Expenses"
            value={<MoneyText paise={big(activeKpis.expenses.valuePaise)} className="text-slate-900" />}
            changePercent={activeKpis.expenses.percentChange}
            changeLabel={PERIOD_CHANGE_LABELS[period]}
          />
          <KpiTile
            label="Gross Profit"
            value={<MoneyText paise={big(activeKpis.grossProfit.valuePaise)} className="text-blue-700" />}
            changePercent={activeKpis.grossProfit.percentChange}
            changeLabel={PERIOD_CHANGE_LABELS[period]}
          />
          <KpiTile
            label="Gross Margin"
            value={<span className="text-blue-700">{activeKpis.margin.marginPercent}</span>}
            helpText={`Prior: ${activeKpis.margin.priorMarginPercent} (${activeKpis.margin.deltaBp >= 0 ? '+' : ''}${activeKpis.margin.deltaBp} bp)`}
          />
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-slate-400">Loading KPIs&hellip;</div>
      )}

      {/* Alerts Widget: Loss-Making Jobs, Expiring Warranties, Low Stock, Stale Leads (FR-8.10) */}
      <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/40 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span>Operational &amp; Margin Alerts (FR-8.10)</span>
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
            {alertCount} Critical Items
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
                <Link href={`/orders/${lossMakingJobs[0].orderId}`} className="underline">
                  {lossMakingJobs[0].orderNumber}
                </Link>{' '}
                ({lossMakingJobs[0].customerName}) at {lossMakingJobs[0].marginPercent} margin!
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
              {expiringWarranties.length > 0
                ? `${expiringWarranties[0].productName} (${expiringWarranties[0].serialNumber}) ends ${expiringWarranties[0].endDate} - offer AMC`
                : 'No equipment expiring soon'}
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
                {lowStockItems[0].productName} ({lowStockItems[0].availableQty} left, reorder at{' '}
                {lowStockItems[0].reorderLevel})!
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">Inventory levels healthy</p>
            )}
          </div>

          {/* Uncontacted Leads >4 business hours */}
          <div className="p-3 bg-white rounded-lg border border-indigo-200 space-y-1">
            <div className="flex items-center justify-between font-bold text-indigo-800">
              <span>Uncontacted Leads (&gt;4h)</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-100">{uncontactedLeads.length}</span>
            </div>
            <p className="text-[11px] text-slate-600">
              {uncontactedLeads.length > 0 ? (
                <>
                  <Link href={`/leads/${uncontactedLeads[0].leadId}`} className="underline">
                    {uncontactedLeads[0].leadNumber}
                  </Link>{' '}
                  uncontacted {uncontactedLeads[0].hoursUncontacted} business hours - SLA breach
                </>
              ) : (
                'All leads contacted within SLA'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Profit per Project Table (C10 / FR-8.2 / Section 5.5 View) - real engine */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Project Profitability &amp; Cost Breakdown (C10)</h3>
            <p className="text-xs text-slate-500">
              Server-computed: Net Revenue - Materials - Labour - Expenses = Install Profit
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
            {projects.length} Orders &bull; Total Profit{' '}
            <MoneyText paise={grossProfitTotal} className="font-bold text-emerald-700" />
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Net Revenue</th>
                <th className="px-3 py-2.5 text-right">Materials</th>
                <th className="px-3 py-2.5 text-right">Labour</th>
                <th className="px-3 py-2.5 text-right">Expenses</th>
                <th className="px-3 py-2.5 text-right font-bold">Install Profit</th>
                <th className="px-3 py-2.5 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No orders yet - profitability appears once orders are dispatched and installed.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr
                    key={p.orderId}
                    className={clsx(
                      'transition-colors',
                      p.isLoss ? 'bg-red-50/70 hover:bg-red-100/70 font-semibold text-red-950' : 'hover:bg-slate-50'
                    )}
                  >
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                      <Link href={`/orders/${p.orderId}`}>{p.orderNumber}</Link>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{p.customerName || 'Customer'}</td>
                    <td className="px-3 py-2.5">
                      <StageChip stage={p.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <MoneyText paise={big(p.netRevenuePaise)} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      <MoneyText paise={big(p.materialsPaise)} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      <MoneyText paise={big(p.labourPaise)} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      <MoneyText paise={big(p.expensesPaise)} />
                    </td>
                    <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLoss ? 'text-red-700' : 'text-emerald-700')}>
                      <MoneyText paise={big(p.installProfitPaise)} />
                    </td>
                    <td className={clsx('px-3 py-2.5 text-right font-bold', p.isLoss ? 'text-red-700' : 'text-slate-800')}>
                      {p.marginPercent}
                    </td>
                  </tr>
                ))
              )}
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
              <span className="font-bold text-purple-700">{pendingSteps.leadsAwaitingSurvey} Leads</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Surveys Awaiting Approval:</span>
              <span className="font-bold text-blue-700">{pendingSteps.surveysAwaitingReview} Surveys</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Orders Pending Advance (30%):</span>
              <span className="font-bold text-amber-700">{pendingSteps.ordersPendingAdvance} Orders</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-700">Confirmed Orders in Warehouse Queue:</span>
              <span className="font-bold text-emerald-700">{pendingSteps.ordersConfirmed} Orders</span>
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
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-blue-600">{t.ticket_number}</span>
                    <span className="text-slate-400 mx-2">&bull;</span>
                    <span className="font-medium text-slate-800">{t.customer?.name}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5 truncate">
                      {t.category} &mdash; {t.description}
                    </span>
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
