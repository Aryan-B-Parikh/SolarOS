import React from 'react';
import { notFound } from 'next/navigation';
import { formatDateTimeIST } from '@/lib/dates';
import {
  verifyDashboardShareToken,
  getKpiMetrics,
  getRevenueTrend,
  type DashboardKpiSummary,
  type MonthlyTrendData,
} from '@/services/analytics';
import { MoneyText } from '@/components/MoneyText';
import { TrendChart } from '@/components/TrendChart';
import { Lock, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PERIOD_LABEL: Record<string, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
  CUSTOM: 'Custom Range',
};

/**
 * Read-only shared analytics view (FR-8.6).
 *
 * Anyone holding a valid, unexpired HMAC-signed dashboard share token can
 * view the KPI snapshot + revenue trend. The token is verified server-side
 * against the same secret used to mint it (POST /api/v1/analytics/share);
 * no session is required and nothing can be mutated from this page.
 */
export default async function SharedDashboardPage({
  params,
}: {
  params: { token: string };
}) {
  let payload:
    | { period: string; expiresAt: Date; kpis: DashboardKpiSummary; trend: MonthlyTrendData[] }
    | null = null;

  try {
    const verified = verifyDashboardShareToken(params.token);
    const [kpis, trend] = await Promise.all([
      getKpiMetrics(verified.period),
      getRevenueTrend(6),
    ]);
    payload = { period: verified.period, expiresAt: verified.expiresAt, kpis, trend };
  } catch {
    // Invalid signature, malformed payload, or expired link (410).
    notFound();
  }

  if (!payload) notFound();
  const { period, expiresAt, kpis, trend } = payload;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-bold text-slate-950">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">SunPower Ops - Executive Snapshot</h1>
              <p className="text-xs text-slate-300">
                {PERIOD_LABEL[period] || period} &bull; {formatDateTimeIST(kpis.dateRange.start)} -{' '}
                {formatDateTimeIST(kpis.dateRange.end)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Lock className="w-3.5 h-3.5" />
            <span>Read-only shared view, expires {formatDateTimeIST(expiresAt)}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SharedKpiCard
            label="Net Revenue"
            valuePaise={kpis.revenue.valuePaise}
            percentChange={kpis.revenue.percentChange}
            invertChange={false}
          />
          <SharedKpiCard
            label="Cash Collections"
            valuePaise={kpis.collections.valuePaise}
            percentChange={kpis.collections.percentChange}
            invertChange={false}
          />
          <SharedKpiCard
            label="Total Expenses"
            valuePaise={kpis.expenses.valuePaise}
            percentChange={kpis.expenses.percentChange}
            invertChange
          />
          <SharedKpiCard
            label="Gross Profit"
            valuePaise={kpis.grossProfit.valuePaise}
            percentChange={kpis.grossProfit.percentChange}
            invertChange={false}
          />
        </div>

        {/* Margin strip */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Gross Margin: <strong className="text-slate-900">{kpis.margin.marginPercent}</strong>{' '}
              (prior period {kpis.margin.priorMarginPercent})
            </span>
          </div>
          <span className="text-slate-500">
            Orders in period: {kpis.counts.ordersCount} &bull; Open tickets:{' '}
            {kpis.counts.openTicketsCount}
          </span>
        </div>

        {/* Revenue trend */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span>Revenue &amp; Profit Trend (6 Months)</span>
          </h2>
          {trend.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No trend data recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TrendChart
                title="Net Revenue"
                data={trend.map((m) => ({ label: m.label, valuePaise: m.revenuePaise }))}
                color="#2563eb"
              />
              <TrendChart
                title="Gross Profit"
                data={trend.map((m) => ({ label: m.label, valuePaise: m.grossProfitPaise }))}
                color="#059669"
              />
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 text-center pb-6">
          This snapshot was shared by SunPower Solar. Figures are estimates in INR and cannot be
          modified from this link. The link stops working automatically after expiry.
        </p>
      </main>
    </div>
  );
}

function SharedKpiCard({
  label,
  valuePaise,
  percentChange,
  invertChange,
}: {
  label: string;
  valuePaise: string;
  percentChange: number;
  invertChange: boolean;
}) {
  const isUp = percentChange > 0;
  const isGood = invertChange ? !isUp : isUp;
  return (
    <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
        <MoneyText paise={BigInt(valuePaise)} />
      </div>
      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1 text-xs font-medium">
        {isUp ? (
          <TrendingUp className={`w-3.5 h-3.5 ${isGood ? 'text-emerald-600' : 'text-red-600'}`} />
        ) : (
          <TrendingDown className={`w-3.5 h-3.5 ${isGood ? 'text-emerald-600' : 'text-red-600'}`} />
        )}
        <span className={isGood ? 'text-emerald-600' : 'text-red-600'}>
          {percentChange >= 0 ? '+' : ''}
          {percentChange}%
        </span>
        <span className="text-slate-400 font-normal">vs prior period</span>
      </div>
    </div>
  );
}
