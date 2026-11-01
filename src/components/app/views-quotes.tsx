// Quotes (S7): template grid with the assessment's recommendation marked,
// BOM table with a rule badge per line, discount limit meter, margin warning
// banner (FR-3.8), versioning and a guarded send with the customer link.

'use client'

import { useState } from 'react'
import { api, money, fmtDate, num, useData, useMutation, nav, pct, useHashRoute, toDateStr } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, Field, Loading, NextStepPanel, PageHeader, StageChip } from './shared'
import { PrintOverlay, QuoteDoc } from './docs'
import { FileText, Send, AlertTriangle, Sparkles, Link2, Printer, RefreshCw, Sun, ShieldCheck, PencilLine, PhoneCall, Plus, Trash2 } from 'lucide-react'

export function QuotesView() {
  const { data, loading } = useData(() => api('/quotes'), [])
  const quotes = data?.quotes ?? []
  return (
    <div>
      <PageHeader title="Quotes" sub={`${quotes.length} quotes`} />
      {loading ? <Loading rows={4} /> : quotes.length === 0 ? <Alert title="No quotes yet">Create one from an approved lead.</Alert> : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">Quote</th><th className="px-3 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">System</th>
              <th className="px-3 py-2.5 font-medium text-right">Total</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium text-right">Valid until</th>
            </tr></thead>
            <tbody>
              {quotes.map((q: any) => (
                <tr key={q.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`quotes/${q.id}`)}>
                  <td className="px-4 py-2.5 font-medium">{q.quoteNumber} <span className="text-xs text-slate-400">v{q.version}</span></td>
                  <td className="px-3 py-2.5">{q.lead?.customer?.name ?? '—'}</td>
                  <td className="px-3 py-2.5">{q.capacityKw} kW {q.systemType === 'ON_GRID' ? 'On-Grid' : q.systemType === 'OFF_GRID' ? 'Off-Grid' : 'Panel set'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(q.totalPaise)}</td>
                  <td className="px-3 py-2.5"><StageChip status={q.status} /></td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fmtDate(q.validUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  )
}

export function QuoteBuilderView() {
  const [routeParts] = useHashRoute()
  const idOrNew = routeParts[2] ?? ''
  {
    // The builder is only meaningful for a specific lead (#/quotes/new/<leadId>);
    // never fire a request with an empty id.
    const { data, loading, error, reload } = useData(() => (idOrNew ? api(`/leads/${idOrNew}`) : Promise.resolve(null)), [idOrNew])
    if (!idOrNew) return <Alert title="Pick a lead first">Quotes are created from a lead — open Leads and choose “Create quote” on an approved survey.</Alert>
    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Not found">{error}</Alert>
    return <QuoteBuilder lead={data.lead} onReload={reload} />
  }
}

function QuoteBuilder({ lead, onReload }: { lead: any; onReload: () => void }) {
  const { data: templatesData } = useData(() => api('/templates'), [])
  const templates = templatesData?.templates ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<any>(null)
  const [discountRs, setDiscountRs] = useState(0)
  const { busy, mutate } = useMutation()

  const assessment = lead.assessments?.[0]
  const approvedSurvey = lead.surveys?.some((s: any) => s.status === 'APPROVED')
  const existingQuotes = lead.quotes ?? []
  const lastQuote = existingQuotes[0]

  const pick = async (code: string) => {
    setSelected(code)
    setDiscountRs(0)
    try {
      const p = await api('/bom/preview', {
        method: 'POST',
        json: { templateCode: code, capacityKw: assessment?.recommendedKw ?? lead.requestedCapacityKw ?? 3, cableDistanceM: lead.surveys?.find((s: any) => s.status === 'APPROVED')?.cableDistanceM ?? null },
      })
      setPreview(p)
    } catch (e: any) { toast.error(e.message) }
  }

  const discountLimitBp = preview?.discountLimitBp ?? 500
  const discountLimit = preview ? Math.round(preview.subtotalPaise * (discountLimitBp / 10000)) / 100 : 0
  const overLimit = discountRs > discountLimit
  const discountPaise = Math.round(discountRs * 100)
  const netTotal = preview ? preview.totalPaise - discountPaise : 0

  const create = () => mutate(async () => {
    // FR-3.4: an over-limit discount is saved on the draft; sending stays blocked
    // until a director approves it (server-side guard in sendQuote).
    const q = await api('/quotes', { method: 'POST', json: { leadId: lead.id, templateCode: selected, discountRupees: discountRs } })
    return q
  }, { success: 'Quote drafted', onDone: (r) => nav(`quotes/${r.quote.id}`) })

  if (!approvedSurvey && existingQuotes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader back={{ label: 'Leads', to: 'leads' }} title={`Quote — ${lead.customer.name}`} sub={lead.leadNumber} />
        <Alert tone="warn" title="The survey must be approved before a quote can be sent (FR-2.4)">
          Approve the survey on the lead page first; this guard is enforced in the service layer.
        </Alert>
      </div>
    )
  }

  const systemTemplates = templates.filter((t: any) => t.systemType === 'ON_GRID' || t.systemType === 'OFF_GRID')
  const panelSets = templates.filter((t: any) => t.systemType === 'PANEL_SET')

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ label: 'Leads', to: 'leads' }}
        title={`Quote builder — ${lead.customer.name}`}
        sub={`${lead.leadNumber} · ${assessment ? `assessment recommends ${assessment.recommendedKw} kW` : 'no assessment yet'} ${!approvedSurvey ? '· survey not approved' : ''}`}
      />

      {/* existing quote versions */}
      {existingQuotes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Versions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {existingQuotes.map((q: any) => (
              <div key={q.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="text-sm">
                  <span className="font-medium">{q.quoteNumber} · v{q.version}</span>
                  <span className="text-slate-400 ml-2">{money(q.totalPaise)}</span>
                  {q.marginWarning && <span className="ml-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">margin {pct(q.estimatedMarginBp)} below target</span>}
                </div>
                <div className="flex items-center gap-2">
                  <StageChip status={q.status} />
                  <Button size="sm" variant="outline" onClick={() => nav(`quotes/${q.id}`)}>Open</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* template grid */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">1 · Pick a system template</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {systemTemplates.map((t: any) => {
              const recommended = assessment && t.capacityKw === assessment.recommendedKw && t.systemType === assessment.recommendedType
              return (
                <button key={t.id} onClick={() => pick(t.code)}
                  className={cn('relative rounded-lg border-2 p-3 text-left transition',
                    selected === t.code ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white')}>
                  {recommended && <span className="absolute -top-2 right-2 rounded-full bg-green-600 text-white text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" /> Recommended</span>}
                  <div className="text-sm font-semibold">{t.capacityKw} kW {t.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{t.code}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{t.bomLines.length} parts</div>
                </button>
              )
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-3">
            {panelSets.map((t: any) => (
              <button key={t.id} onClick={() => pick(t.code)}
                className={cn('rounded-lg border p-2.5 text-left transition', selected === t.code ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300')}>
                <div className="text-xs font-semibold flex items-center gap-1"><Sun className="h-3 w-3 text-amber-500" /> {t.name.replace('Solar panel set — ', '')}</div>
                <div className="text-[11px] text-slate-400">panel set</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* BOM preview */}
      {preview && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · Parts list (BOM engine)</CardTitle>
              <div className="text-xs text-slate-500">{preview.result.panelCount} panels = {preview.result.installedKwp} kWp · cable run {preview.result.usedCableDistanceM} m</div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead><tr className="border-b text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Rule</th><th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th><th className="px-4 py-2 font-medium text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {preview.result.lines.map((l: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2">{l.name}{l.isSerialized && <span className="ml-1.5 text-[10px] text-blue-700 bg-blue-50 rounded px-1 py-0.5">serial-scanned</span>}</td>
                      <td className="px-3 py-2"><span className="text-[10px] font-mono rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{l.rule}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.qty)} {l.uom.toLowerCase()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(l.unitPricePaise)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{money(l.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.result.warnings.length > 0 && (
                <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">{preview.result.warnings.join(' ')}</div>
              )}
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* pricing */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">3 · Pricing</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Discount (₹) — your limit is {discountLimitBp / 100}% = {money(Math.round(preview.subtotalPaise * (discountLimitBp / 10000)))}</Label>
                  <Input type="number" value={discountRs} onChange={(e) => setDiscountRs(Number(e.target.value))} />
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn('h-full', overLimit ? 'bg-red-500' : 'bg-blue-600')} style={{ width: `${Math.min(100, (discountRs / Math.max(1, discountLimit)) * 100)}%` }} />
                  </div>
                </div>
                {overLimit && (
                  <Alert tone="warn" title="Discount above your limit — director approval required">
                    Save the draft with this discount; a director must approve it before the quote can be sent (FR-3.4).
                  </Alert>
                )}
                <div className="space-y-1 text-sm border-t pt-3">
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(preview.subtotalPaise)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">− {money(discountPaise)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Tax (GST)</span><span className="tabular-nums">{money(preview.taxPaise)}</span></div>
                  <div className="flex justify-between font-semibold text-base"><span>Total</span><span className="tabular-nums">{money(netTotal)}</span></div>
                  <div className="flex justify-between text-xs text-slate-400"><span>Indicative subsidy (not deducted)</span><span className="tabular-nums">{money(preview.subsidyEstimatePaise ?? 0)}</span></div>
                </div>
                <Button className="w-full" disabled={busy} onClick={create}><FileText className="h-4 w-4 mr-1.5" /> Create quote draft</Button>
              </CardContent>
            </Card>

            {/* margin */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Margin check (internal, never shown to the customer)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Estimated margin</span>
                  <span className={cn('text-2xl font-semibold tabular-nums', preview.margin.warning ? 'text-amber-700' : 'text-green-700')}>{pct(preview.margin.marginBp)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={cn('h-full', preview.margin.warning ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${Math.min(100, (preview.margin.marginBp / 3000) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-400"><span>target 20%</span><span>scale to 30%</span></div>
                {preview.margin.warning ? (
                  <Alert tone="warn" title="Below the target margin">
                    Estimated margin is under the 20% target. You can still send the quote; the warning is audited and visible to the director.
                  </Alert>
                ) : (
                  <Alert tone="success" title="Margin healthy">At or above the 20% target set by the director.</Alert>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="BOM standard cost">{money(preview.result.lines.reduce((s: number, l: any) => s + l.lineCostPaise, 0))}</Field>
                  <Field label="Template labour allowance">{money(templates.find((t: any) => t.code === selected)?.labourAllowancePaise ?? 0)}</Field>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ── quote detail (created quote) ─────────────────────────────────

export function QuoteDetailView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/quotes/${id}`), [id])
    const { data: meData } = useData(() => api('/auth/me'), [])
    const { data: productsData } = useData(() => api('/products'), [])
    const { busy, mutate } = useMutation()
    const [token, setToken] = useState<string | null>(null)
    const [printing, setPrinting] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editLines, setEditLines] = useState<any[]>([])
    const [accepting, setAccepting] = useState(false)
    const [acceptName, setAcceptName] = useState('')
    const [acceptNote, setAcceptNote] = useState('')

    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Quote not found">{error}</Alert>
    const q = data.quote
    const lead = q.lead
    const isDirector = meData?.user?.role === 'DIRECTOR'

    // manual line editing (drafts only): qty / rate / remove / add catalogue items
    const openEdit = () => {
      setEditLines(q.lines.map((l: any) => ({ productId: l.productId, description: l.description, qty: l.qty, unitPriceRupees: l.unitPricePaise / 100, taxRateBp: l.taxRateBp })))
      setEditing(true)
    }
    const saveLines = () => mutate(async () => api(`/quotes/${id}/lines`, { method: 'POST', json: { lines: editLines } }), {
      success: 'Lines updated — totals, GST and margin recomputed',
      onDone: () => { setEditing(false); reload() },
    })
    const recordAcceptance = () => mutate(() => api(`/quotes/${id}/accept`, { method: 'POST', json: { acceptedName: acceptName, note: acceptNote || null } }), {
      success: 'Offline acceptance recorded — order created',
      onDone: () => setAccepting(false),
    })
    const products = productsData?.products ?? []
    const editSubtotal = editLines.reduce((s: number, l: any) => s + Math.round(l.qty * l.unitPriceRupees * 100), 0)

    return (
      <div className="space-y-5">
        <PageHeader
          back={{ label: 'Quotes', to: 'quotes' }}
          title={`${q.quoteNumber} · v${q.version}`}
          sub={`${q.capacityKw} kW ${q.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} · ${lead?.customer?.name} · valid until ${fmtDate(q.validUntil)}`}
          actions={<StageChip status={q.status} />}
        />

        {q.status === 'DRAFT' && (
          <NextStepPanel
            title="Send the quote to the customer"
            hint={`A secure link is sent by SMS; the customer accepts or rejects from it. Expiry ${fmtDate(q.validUntil)}.`}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={openEdit}><PencilLine className="h-3.5 w-3.5 mr-1" /> Edit lines</Button>
                <Button size="sm" disabled={busy} onClick={() => mutate(async () => {
                  const r = await api(`/quotes/${id}/send`, { method: 'POST' })
                  setToken(r.token)
                  return r
                }, { success: 'Quote sent — link delivered by SMS', onDone: reload })}><Send className="h-3.5 w-3.5 mr-1" /> Send quote</Button>
              </div>
            }
          />
        )}
        {data.discountNeedsApproval && (
          <Alert tone="warn" title="Discount needs director approval (FR-3.4)">
            The discount of {money(q.discountPaise)} is above the sales limit of {money(data.discountLimitPaise)}. Sending is blocked until a director approves it.
            {isDirector && (
              <div className="mt-2">
                <Button size="sm" disabled={busy} onClick={() => mutate(() => api(`/quotes/${id}/approve-discount`, { method: 'POST' }), { success: 'Discount approved — sending unlocked', onDone: reload })}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve discount
                </Button>
              </div>
            )}
          </Alert>
        )}
        {q.status === 'SENT' && (
          <Alert tone="info" title="Sent to the customer">
            The customer can accept or reject from their secure link. A rejection keeps the lead with sales for a revision.
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => mutate(() => api(`/quotes/${id}/revise`, { method: 'POST', json: {} }), { success: 'Revision drafted', onDone: (r: any) => nav(`quotes/${r.quote.id}`) })}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Revise (new version)
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAcceptName(lead?.customer?.name ?? ''); setAcceptNote(''); setAccepting(true) }}>
                <PhoneCall className="h-3.5 w-3.5 mr-1" /> Record offline acceptance
              </Button>
            </div>
          </Alert>
        )}
        {token && (
          <Alert tone="success" title="Customer link ready">
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <code className="text-xs bg-white border rounded px-2 py-1">#/q/{token}</code>
              <Button size="sm" variant="outline" onClick={() => window.open(`#/q/${token}`, '_blank')}><Link2 className="h-3.5 w-3.5 mr-1" /> Open customer quote view</Button>
            </div>
          </Alert>
        )}
        {q.status === 'REJECTED' && (
          <Alert tone="warn" title={`Rejected by the customer: “${q.rejectReason}”`}>
            The lead stays with sales. Revise when ready — v{q.version} stays read-only.
            <div className="mt-2"><Button size="sm" variant="outline" onClick={() => mutate(() => api(`/quotes/${id}/revise`, { method: 'POST', json: {} }), { success: 'Revision drafted', onDone: (r: any) => nav(`quotes/${r.quote.id}`) })}>Revise</Button></div>
          </Alert>
        )}
        {q.marginWarning && (
          <Alert tone="warn" title={`Margin warning: estimated ${pct(q.estimatedMarginBp)} is below the 20% target`} />
        )}

        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">Parts list</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead><tr className="border-b text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Rule</th><th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th><th className="px-4 py-2 font-medium text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {q.lines.map((l: any) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2">{l.description}</td>
                      <td className="px-3 py-2">{l.rule ? <span className="text-[10px] font-mono rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{l.rule}</span> : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(l.unitPricePaise)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{money(l.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 space-y-1 text-sm border-t bg-slate-50/60">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(q.subtotalPaise)}</span></div>
                {q.discountPaise > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">− {money(q.discountPaise)}</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">Tax (GST)</span><span className="tabular-nums">{money(q.taxPaise)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{money(q.totalPaise)}</span></div>
                {q.subsidyEstimatePaise > 0 && <div className="flex justify-between text-xs text-slate-400"><span>Indicative subsidy</span><span className="tabular-nums">{money(q.subsidyEstimatePaise)}</span></div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Customer">{lead?.customer?.name}</Field>
              <Field label="Lead">{lead?.leadNumber}</Field>
              <Field label="Cable run used">{q.cableDistanceM} m</Field>
              <Field label="Sent">{q.sentAt ? fmtDate(toDateStr(q.sentAt)) : '—'}</Field>
              <Field label="Accepted">{q.acceptedAt ? `${fmtDate(toDateStr(q.acceptedAt))} by ${q.acceptedName}` : '—'}</Field>
              <Field label="Estimated margin">{pct(q.estimatedMarginBp)}</Field>
              {data.savings && <Field label="Payback (est.)">{data.savings.paybackYears != null ? `≈ ${data.savings.paybackYears} years` : '—'}</Field>}
              <Button variant="outline" size="sm" className="w-full" onClick={() => setPrinting(true)}><Printer className="h-3.5 w-3.5 mr-1" /> Print / save PDF</Button>
            </CardContent>
          </Card>
        </div>

        {printing && (
          <PrintOverlay title={`Quotation ${q.quoteNumber}`} onClose={() => setPrinting(false)}>
            <QuoteDoc
              q={{
                quoteNumber: q.quoteNumber, version: q.version, status: q.status, capacityKw: q.capacityKw, systemType: q.systemType,
                validUntil: q.validUntil, subtotalPaise: q.subtotalPaise, discountPaise: q.discountPaise, taxPaise: q.taxPaise,
                totalPaise: q.totalPaise, subsidyEstimatePaise: q.subsidyEstimatePaise,
                lines: q.lines.map((l: any) => ({ description: l.description, qty: l.qty, uom: l.product?.uom, unitPricePaise: l.unitPricePaise, lineTotalPaise: l.lineTotalPaise })),
                customerName: lead?.customer?.name, savings: data.savings,
              }}
              branding={data.branding}
            />
          </PrintOverlay>
        )}

        {/* manual quote-line editor (drafts only) */}
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit quote lines</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {editLines.map((l: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-5" value={l.description} onChange={(e) => setEditLines((ls) => ls.map((x: any, j: number) => j === i ? { ...x, description: e.target.value } : x))} />
                  <Input className="col-span-2" type="number" step="0.01" min="0" value={l.qty} onChange={(e) => setEditLines((ls) => ls.map((x: any, j: number) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
                  <Input className="col-span-3" type="number" min="0" value={l.unitPriceRupees} onChange={(e) => setEditLines((ls) => ls.map((x: any, j: number) => j === i ? { ...x, unitPriceRupees: Number(e.target.value) } : x))} />
                  <div className="col-span-2 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditLines((ls) => ls.filter((_: any, j: number) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
              <select
                className="text-sm border rounded px-2 py-1.5 w-full"
                value=""
                onChange={(e) => {
                  const p = products.find((x: any) => x.id === e.target.value)
                  if (p) setEditLines((ls) => [...ls, { productId: p.id, description: p.name, qty: 1, unitPriceRupees: p.salePricePaise / 100, taxRateBp: p.taxRateBp }])
                }}
              >
                <option value="">+ Add a product from the catalogue…</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {money(p.salePricePaise)}</option>)}
              </select>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-slate-500">New subtotal (GST recomputed on save)</span>
                <span className="font-semibold tabular-nums">{money(editSubtotal)}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button disabled={busy || editLines.length === 0} onClick={saveLines}>Save lines</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* offline acceptance recorder */}
        <Dialog open={accepting} onOpenChange={setAccepting}>
          <DialogContent>
            <DialogHeader><DialogTitle>Record offline acceptance</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Use this when the customer accepted by phone or in person. The order is created now; the audit trail records that you entered this on their behalf.</p>
              <div className="space-y-1.5">
                <Label htmlFor="accept-name">Customer signed as</Label>
                <Input id="accept-name" value={acceptName} onChange={(e) => setAcceptName(e.target.value)} placeholder="Full name as spoken/written" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accept-note">Note (optional)</Label>
                <Textarea id="accept-note" value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} placeholder="e.g. accepted over phone, will pay advance by UPI tomorrow" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccepting(false)}>Cancel</Button>
              <Button disabled={busy || acceptName.trim().length < 2} onClick={recordAcceptance}>Record acceptance</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
}
