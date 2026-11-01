// Director dashboard (S19) and analytics: KPI tiles per period with change,
// monthly revenue trend chart, top-profit jobs, alerts widget (loss-making
// jobs, expiring warranties, low stock, uncontacted leads), pipeline by stage,
// profit per project with losses highlighted, pending steps and open tickets.

'use client'

import { useState } from 'react'
import { api, money, fmtDate, num, useData, useMutation, pct, ORDER_STAGES, LEAD_STAGES, nav, VERDICT_COPY, todayStr } from './lib'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { EmptyState, KpiTile, Loading, PageHeader, StageChip } from './shared'
import { TrendingDown, TrendingUp, AlertTriangle, Clock, ArrowRight, RefreshCw, Sun, Bell, Link2, Printer, Mail } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Period = 'today' | 'week' | 'month' | 'all' | 'custom'

export function DashboardView() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const range = period === 'custom' && customFrom && customTo ? { from: customFrom, to: customTo } : undefined
  const { data, loading, reload } = useData(
    () => (period === 'custom' && !range ? Promise.resolve(null) : api(`/analytics/dashboard?period=${period}${range ? `&from=${range.from}&to=${range.to}` : ''}`)),
    [period, customFrom, customTo],
  )
  const { busy, mutate } = useMutation()

  if (loading) return <Loading rows={6} />
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Dashboard" sub="Custom date range (FR-8.1)" />
        <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="space-y-1"><label className="text-xs text-slate-500">From</label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
          <div className="space-y-1"><label className="text-xs text-slate-500">To</label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
          <Button size="sm" disabled={!customFrom || !customTo} onClick={() => setPeriod('custom')}>Apply range</Button>
        </CardContent></Card>
      </div>
    )
  }
  const d = data

  const makeShare = () => mutate(
    () => api('/analytics/share', { method: 'POST', json: { period, from: range?.from, to: range?.to, days: 7 } }),
    { success: 'Share link created — valid for 7 days', onDone: (r: any) => setShareUrl(r.url) },
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        sub={`${fmtDate(d.bounds.from)} → ${fmtDate(d.bounds.to)}`}
        actions={
          <>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['today', 'week', 'month', 'all'] as Period[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn('px-3 py-1.5 text-xs font-medium transition', period === p ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                  {p === 'today' ? 'Today' : p === 'week' ? '7 days' : p === 'month' ? 'This month' : 'All time'}
                </button>
              ))}
              <button onClick={() => setPeriod('custom')}
                className={cn('px-3 py-1.5 text-xs font-medium transition', period === 'custom' ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                Custom
              </button>
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-8 w-36 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <span className="text-xs text-slate-400">→</span>
                <Input type="date" className="h-8 w-36 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={makeShare}><Link2 className="h-3.5 w-3.5 mr-1" /> Share</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print / PDF</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api('/cron/digest', { method: 'POST' }), { success: 'Daily digest generated', onDone: reload })}>
              <Mail className="h-3.5 w-3.5 mr-1" /> Daily digest
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api('/cron/outbox', { method: 'POST' }), { success: 'Outbox processed', onDone: reload })}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Run notifications
            </Button>
          </>
        }
      />

      {shareUrl && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
          <Link2 className="h-3.5 w-3.5 text-blue-700" />
          <span className="text-blue-900">Read-only share link (expires in 7 days):</span>
          <code className="text-xs bg-white border rounded px-2 py-0.5">{shareUrl}</code>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { navigator.clipboard?.writeText(window.location.origin + shareUrl); toast.success('Copied') }}>Copy</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.open(`#${shareUrl}`, '_blank')}>Open</Button>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiTile title="Revenue" value={money(d.kpis.revenuePaise)} sub={`${d.kpis.ordersCount} orders`} />
        <KpiTile title="Collections" value={money(d.kpis.collectionsPaise)} sub="payments received" />
        <KpiTile title="Expenses" value={money(d.kpis.expensesPaise)} sub="incl. technician labour" />
        <KpiTile title="Gross profit" value={money(d.kpis.grossProfitPaise)} tone={d.kpis.grossProfitPaise >= 0 ? 'success' : 'danger'} />
        <KpiTile title="Margin" value={pct(d.kpis.marginBp)} tone={d.kpis.marginBp >= 2000 ? 'success' : 'danger'} sub="target 20%" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue trend</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 100000)}L`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v: any) => money(Number(v))} labelStyle={{ fontWeight: 600 }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenuePaise" stroke="#1d4ed8" strokeWidth={2} fill="url(#rev)" name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* alerts widget */}
        <Card className={cn(d.alerts.lossMakingJobs.length + d.alerts.lowStock.length + d.alerts.uncontactedLeads.length + d.alerts.expiringWarranties.length > 0 && 'border-amber-200')}>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1.5"><Bell className="h-4 w-4 text-amber-600" /> Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {d.alerts.lossMakingJobs.map((j: any) => (
              <AlertRow key={j.number} icon={<TrendingDown className="h-3.5 w-3.5" />} tone="danger" title={`${j.number} losing ${money(Math.abs(j.profit))}`} sub={j.customer} onClick={() => nav(`orders/${j.orderId ?? ''}`)} />
            ))}
            {d.alerts.lowStock.map((s: any) => (
              <AlertRow key={s.id} icon={<AlertTriangle className="h-3.5 w-3.5" />} tone="warn" title={`${s.name} below reorder level`} sub={`${num(s.available)} available · reorder at ${num(s.reorderLevel)}`} onClick={() => nav('stock')} />
            ))}
            {d.alerts.uncontactedLeads.map((l: any) => (
              <AlertRow key={l.number} icon={<Clock className="h-3.5 w-3.5" />} tone="warn" title={`${l.number} uncontacted past SLA`} sub={l.customer} onClick={() => nav('leads')} />
            ))}
            {d.alerts.expiringWarranties.map((w: any) => (
              <AlertRow key={w.serial} icon={<Sun className="h-3.5 w-3.5" />} tone="warn" title={`${w.unit} warranty ends in ${w.daysLeft} days`} sub={`${w.customer} · offer an annual maintenance contract`} onClick={() => nav('service')} />
            ))}
            {d.alerts.deadMessages > 0 && (
              <AlertRow icon={<AlertTriangle className="h-3.5 w-3.5" />} tone="danger" title={`${d.alerts.deadMessages} dead messages`} sub="outbox gave up after 5 attempts" onClick={() => nav('notifications')} />
            )}
            {d.alerts.lossMakingJobs.length + d.alerts.lowStock.length + d.alerts.uncontactedLeads.length + d.alerts.expiringWarranties.length + d.alerts.deadMessages === 0 && (
              <EmptyState title="All clear" hint="No loss-making jobs, low stock, stale leads or expiring warranties." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* profit per project */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Profit per project</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto overflow-x-auto scroll-thin">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Order</th><th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium text-right">Net revenue</th><th className="px-3 py-2 font-medium text-right">Materials</th>
                  <th className="px-3 py-2 font-medium text-right">Labour</th><th className="px-3 py-2 font-medium text-right">Profit</th><th className="px-4 py-2 font-medium text-right">Margin</th>
                </tr></thead>
                <tbody>
                  {d.profitability.slice(0, 40).map((p: any) => (
                    <tr key={p.orderId} className={cn('border-b last:border-0 cursor-pointer hover:bg-slate-50', p.profit < 0 && 'bg-red-50/60')} onClick={() => nav(`orders/${p.orderId}`)}>
                      <td className="px-4 py-2 font-medium">{p.orderNumber}</td>
                      <td className="px-3 py-2">{p.customer}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(p.netRevenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(p.materials)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(p.labour)}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', p.profit < 0 ? 'text-red-700' : 'text-green-700')}>{money(p.profit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{pct(p.marginBp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* pipeline + pending */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pipeline by stage</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {LEAD_STAGES.filter((s) => !['WON', 'LOST', 'DISQUALIFIED'].includes(s.key)).map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="w-28 text-slate-500 text-xs">{s.label}</span>
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-600/80" style={{ width: `${Math.min(100, ((d.pipeline[s.key] ?? 0) / Math.max(1, ...Object.values(d.pipeline).map((v: unknown) => Number(v) || 0))) * 100)}%` }} />
                  </div>
                  <span className="tabular-nums text-xs w-5 text-right">{d.pipeline[s.key] ?? 0}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-sm pt-1">
                <span className="w-28 text-green-700 text-xs font-medium">Won</span>
                <span className="tabular-nums text-xs">{d.pipeline.WON ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pending steps</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 max-h-72 overflow-y-auto scroll-thin">
              {d.pendingSteps.leads.slice(0, 6).map((l: any) => (
                <button key={l.id} onClick={() => nav(`leads/${l.id}`)} className="w-full flex items-center justify-between gap-2 text-left text-sm hover:bg-slate-50 rounded p-1.5">
                  <span className="truncate">{l.customer}</span>
                  <span className="text-xs text-slate-400 shrink-0">{l.status === 'NEW' ? `${l.daysInStage}d waiting` : LEAD_STAGES.find((s) => s.key === l.status)?.label}</span>
                </button>
              ))}
              {d.pendingSteps.orders.slice(0, 6).map((o: any) => (
                <button key={o.id} onClick={() => nav(`orders/${o.id}`)} className="w-full flex items-center justify-between gap-2 text-left text-sm hover:bg-slate-50 rounded p-1.5">
                  <span className="truncate">{o.customer}</span>
                  <span className="text-xs text-slate-400 shrink-0">{ORDER_STAGES.find((s) => s.key === o.status)?.label}</span>
                </button>
              ))}
              {d.pendingSteps.tickets.slice(0, 6).map((t: any) => (
                <button key={t.id} onClick={() => nav(`ticket/${t.id}`)} className="w-full flex items-center justify-between gap-2 text-left text-sm hover:bg-slate-50 rounded p-1.5">
                  <span className="truncate">{t.customer} · {t.unit ?? 'system'}</span>
                  <span className="text-xs shrink-0 text-slate-400">{t.status === 'RESOLVED' ? 'awaiting confirmation' : t.status.replace(/_/g, ' ').toLowerCase()}</span>
                </button>
              ))}
              {d.pendingSteps.leads.length + d.pendingSteps.orders.length + d.pendingSteps.tickets.length === 0 && <EmptyState title="Nothing pending" />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AlertRow({ icon, tone, title, sub, onClick }: { icon: React.ReactNode; tone: 'warn' | 'danger'; title: string; sub?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-left hover:border-slate-300 hover:bg-slate-50 transition">
      <span className={cn('mt-0.5', tone === 'danger' ? 'text-red-600' : 'text-amber-600')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{title}</span>
        {sub && <span className="block text-xs text-slate-400 truncate">{sub}</span>}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 mt-1 shrink-0" />
    </button>
  )
}

// ── analytics view (profit focus + top jobs + maintenance) ────────

export function AnalyticsView() {
  const { data, loading } = useData(() => api('/analytics/dashboard?period=all'), [])
  const { data: maint, loading: l2 } = useData(() => api('/maintenance-alerts'), [])
  const { busy, mutate } = useMutation()
  const [ranMaintenance, setRanMaintenance] = useState(false)

  if (loading || !data) return <Loading rows={6} />
  const d = data

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        sub="All-time profitability and predictive maintenance"
        actions={
          <Button size="sm" variant="outline" disabled={busy || ranMaintenance} onClick={() => mutate(() => api('/cron/maintenance', { method: 'POST' }), {
            success: 'Maintenance rules run — no duplicate alerts',
            onDone: () => setRanMaintenance(true),
          })}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', busy && 'animate-spin')} /> Run maintenance job
          </Button>
        }
      />

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top-profit jobs</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Order</th><th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium text-right">Profit</th><th className="px-4 py-2 font-medium text-right">Margin</th>
              </tr></thead>
              <tbody>
                {d.topProfitJobs.map((p: any) => (
                  <tr key={p.orderId} className="border-b last:border-0 cursor-pointer hover:bg-slate-50" onClick={() => nav(`orders/${p.orderId}`)}>
                    <td className="px-4 py-2 font-medium">{p.orderNumber}</td>
                    <td className="px-3 py-2">{p.customer}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-700 font-medium">{money(p.profit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{pct(p.marginBp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Loss-making jobs</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {d.lossMaking.length === 0 ? <div className="p-4"><EmptyState title="No loss-making jobs" /></div> : (
              <table className="w-full text-sm min-w-[320px]">
                <thead><tr className="border-b text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Order</th><th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium text-right">Loss</th>
                </tr></thead>
                <tbody>
                  {d.lossMaking.map((p: any) => (
                    <tr key={p.orderId} className="border-b last:border-0 bg-red-50/50 cursor-pointer hover:bg-red-50" onClick={() => nav(`orders/${p.orderId}`)}>
                      <td className="px-4 py-2 font-medium">{p.orderNumber}</td>
                      <td className="px-3 py-2">{p.customer}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-700 font-semibold">{money(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Predictive maintenance alerts</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {l2 ? <Loading rows={2} /> : (maint?.alerts ?? []).length === 0 ? (
            <div className="p-4"><EmptyState title="No open maintenance alerts" hint="Run the daily job to score installations (cleaning due, battery age, repeat faults, warranty ending)." /></div>
          ) : (
            <table className="w-full text-sm min-w-[500px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Rule</th><th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Reason</th><th className="px-3 py-2 font-medium text-right">Risk</th>
                <th className="px-4 py-2 font-medium text-right">Due</th>
              </tr></thead>
              <tbody>
                {(maint?.alerts ?? []).map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium">{a.rule.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="px-3 py-2">{a.installation?.order?.customer?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{a.reason}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.riskScore}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{fmtDate(a.dueOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Exports</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => exportCsv(d.profitability, ['orderNumber', 'customer', 'netRevenue', 'materials', 'labour', 'expenses', 'profit', 'marginBp'], 'profit-per-project')}>Profit per project (CSV)</Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv(d.trend, ['month', 'revenuePaise', 'orders'], 'revenue-trend')}>Revenue trend (CSV)</Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv(d.pendingSteps.leads, ['number', 'customer', 'status', 'daysInStage'], 'open-leads')}>Open leads (CSV)</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function exportCsv(rows: any[], cols: string[], name: string) {
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── FR-8.6: read-only dashboard snapshot opened from an expiring share link ──

export function SharedDashboardView({ token }: { token: string }) {
  const { data, loading, error } = useData(() => api(`/public/share/${token}`), [token])
  if (loading) return <Loading rows={6} />
  if (error) return <EmptyState title="This share link is not valid" hint={error} />
  const d = data.dashboard
  return (
    <div className="space-y-5">
      <PageHeader
        title="Shared analytics (read-only)"
        sub={`${fmtDate(d.bounds.from)} → ${fmtDate(d.bounds.to)} · snapshot expires ${fmtDate(String(data.share.expiresAt).slice(0, 10))}`}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiTile title="Revenue" value={money(d.kpis.revenuePaise)} sub={`${d.kpis.ordersCount} orders`} />
        <KpiTile title="Collections" value={money(d.kpis.collectionsPaise)} sub="payments received" />
        <KpiTile title="Expenses" value={money(d.kpis.expensesPaise)} sub="incl. technician labour" />
        <KpiTile title="Gross profit" value={money(d.kpis.grossProfitPaise)} tone={d.kpis.grossProfitPaise >= 0 ? 'success' : 'danger'} />
        <KpiTile title="Margin" value={pct(d.kpis.marginBp)} tone={d.kpis.marginBp >= 2000 ? 'success' : 'danger'} sub="target 20%" />
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue trend</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revShare" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 100000)}L`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenuePaise" stroke="#1d4ed8" strokeWidth={2} fill="url(#revShare)" name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top profit jobs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.topProfitJobs.map((j: any) => (
              <div key={j.orderNumber} className="flex items-center justify-between text-sm border-b last:border-0 pb-1.5">
                <span>{j.orderNumber} · {j.customer}</span>
                <span className="tabular-nums font-medium text-green-700">{money(j.profit)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-slate-400">Read-only snapshot shared by SunPower Solar Energy Pvt Ltd — figures as of the moment the link was created.</p>
    </div>
  )
}
