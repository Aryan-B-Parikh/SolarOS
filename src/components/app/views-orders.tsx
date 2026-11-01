// Orders (S9, S10): stage tracker, payments ledger with the advance
// threshold, allocation per line with shortages in red, crew and date,
// subsidy checklist, plus the weekly schedule grid with ranked crew
// suggestions and their score breakdown.

'use client'

import { useState } from 'react'
import { api, money, fmtDate, num, useData, useMutation, ORDER_STAGES, nav, todayStr, pct, useHashRoute } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, EmptyState, Field, Loading, NextStepPanel, PageHeader, StageChip } from './shared'
import { Wallet, CalendarDays, Truck, Ban, ArrowRight, Clock } from 'lucide-react'

export function OrdersView() {
  const [status, setStatus] = useState('')
  const { data, loading } = useData(() => api(`/orders${status ? `?status=${status}` : ''}`), [status])
  const orders = data?.orders ?? []
  return (
    <div>
      <PageHeader title="Orders" sub={`${orders.length} orders`} />
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {['', ...ORDER_STAGES.map((s) => s.key)].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', status === s ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
            {s === '' ? 'All' : ORDER_STAGES.find((x) => x.key === s)?.label}
          </button>
        ))}
      </div>
      {loading ? <Loading rows={5} /> : orders.length === 0 ? <EmptyState title="No orders in this stage" /> : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">Order</th><th className="font-medium">Customer</th><th className="font-medium">System</th>
              <th className="font-medium text-right">Total</th><th className="font-medium text-right">Paid</th><th className="font-medium">Status</th>
            </tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`orders/${o.id}`)}>
                  <td className="px-4 py-2.5 font-medium">{o.orderNumber}</td>
                  <td>{o.customer.name}</td>
                  <td>{o.capacityKw} kW {o.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'}</td>
                  <td className="text-right tabular-nums">{money(o.totalPaise)}</td>
                  <td className="text-right tabular-nums">{money(o.paidPaise)}</td>
                  <td><StageChip status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  )
}

export function OrderDetailView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/orders/${id}`), [id])
    const { data: meData } = useData(() => api('/auth/me'), [])
    const { busy, mutate } = useMutation()

    if (loading) return <Loading rows={5} />
    if (error) return <Alert tone="warn" title="Order not found">{error}</Alert>
    const o = data.order
    const inst = o.installation
    const dispatch = o.dispatches?.[0]
    const balance = o.totalPaise - o.paidPaise
    const shortage = o.lines.some((l: any) => l.qtyReserved < l.qty)
    const stageIdx = ORDER_STAGES.findIndex((s) => s.key === o.status)
    const isDirector = meData?.user?.role === 'DIRECTOR'

    return (
      <div className="space-y-5">
        <PageHeader
          back={{ label: 'Orders', to: 'orders' }}
          title={o.orderNumber}
          sub={`${o.customer.name} · ${o.capacityKw} kW ${o.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} · created ${fmtDate(o.createdAt?.slice(0, 10))}`}
          actions={<StageChip status={o.status} />}
        />

        {/* stage tracker */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {ORDER_STAGES.filter((s) => s.key !== 'CANCELLED').map((s, i) => (
                <div key={s.key} className="flex items-center">
                  <div className="flex flex-col items-center gap-1 min-w-20">
                    <span className={cn('grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-semibold',
                      i < stageIdx ? 'bg-green-500 border-green-500 text-white' : i === stageIdx ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-300')}>
                      {i + 1}
                    </span>
                    <span className={cn('text-[10px] text-center', i === stageIdx ? 'text-blue-700 font-semibold' : 'text-slate-400')}>{s.label}</span>
                  </div>
                  {i < 5 && <div className={cn('h-0.5 w-4 sm:w-8 mb-4', i < stageIdx ? 'bg-green-500' : 'bg-slate-200')} />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* next step */}
        {o.status === 'PENDING_ADVANCE' && (
          <NextStepPanel title="Record the advance payment" hint={`30% advance = ${money(o.advanceRequiredPaise)}. The order confirms automatically when the threshold is reached.`} />
        )}
        {o.status === 'CONFIRMED' && (
          <NextStepPanel title="Confirm the crew and installation date" hint={shortage ? 'Stock shortage is blocking dispatch — see the allocation below.' : 'Ranked crew suggestions are ready on the schedule screen or below.'}
            action={<Button size="sm" onClick={() => nav('schedule')}><CalendarDays className="h-3.5 w-3.5 mr-1" /> Open schedule</Button>} />
        )}
        {o.status === 'READY_TO_DISPATCH' && (
          <NextStepPanel title="Warehouse is picking and scanning serials" hint={`Dispatch ${dispatch?.dispatchNumber} is in the warehouse queue.`}
            action={<Button size="sm" variant="outline" onClick={() => nav(`dispatch/${dispatch?.id}`)}>Open dispatch</Button>} />
        )}
        {(o.status === 'DISPATCHED' || o.status === 'DELIVERED') && inst && (
          <NextStepPanel title={o.status === 'DISPATCHED' ? 'Crew confirms delivery on site' : 'Run the installation'} hint="Warranties start at delivery for most equipment."
            action={<Button size="sm" onClick={() => nav(`job/${inst.id}`)}>Open job</Button>} />
        )}
        {o.status === 'INSTALLED' && (
          <NextStepPanel title="Collect the balance and close" hint={balance > 0 ? `${money(balance)} outstanding — the final invoice has been issued.` : 'Fully paid — close the order from Accounts when the subsidy paperwork is done.'} />
        )}
        {shortage && o.status !== 'CANCELLED' && (
          <Alert tone="warn" title="Stock shortage on this order">
            Dispatch stays blocked until every line is reserved. Receive stock or check the low-stock product.
            <span className="block text-xs text-amber-800/80 mt-1">Received stock is allocated automatically — shortages clear when covered.</span>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* lines + allocation */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Lines and stock allocation</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-slate-400">
                    <th className="px-4 py-2 font-medium">Item</th><th className="font-medium text-right">Qty</th>
                    <th className="font-medium text-right">Reserved</th><th className="font-medium text-right">Dispatched</th><th className="font-medium text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {o.lines.map((l: any) => {
                      const short = l.qtyReserved < l.qty
                      return (
                        <tr key={l.id} className={cn('border-b last:border-0', short && 'bg-red-50/50')}>
                          <td className="px-4 py-2">{l.description}{short && <span className="ml-2 text-xs text-red-600 font-medium">short by {num(l.qty - l.qtyReserved)}</span>}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{num(l.qty)}</td>
                          <td className={cn('px-4 py-2 text-right tabular-nums', short && 'text-red-600 font-semibold')}>{num(l.qtyReserved)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500">{num(l.qtyDispatched)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{money(l.unitPricePaise * l.qty)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-3 space-y-1 text-sm border-t bg-slate-50/60">
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(o.subtotalPaise)}</span></div>
                  {o.discountPaise > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">− {money(o.discountPaise)}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-500">Tax (GST)</span><span className="tabular-nums">{money(o.taxPaise)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{money(o.totalPaise)}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* payments */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Payments</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {o.payments.length === 0 && <p className="text-sm text-slate-500">No payments recorded yet.</p>}
                {o.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                    <div>
                      <span className={cn('font-medium', p.kind === 'REVERSAL' && 'text-red-700')}>{p.kind === 'REVERSAL' ? '− ' : ''}{money(p.amountPaise)}</span>
                      <span className="text-slate-400 ml-2">{p.method} · {p.kind.toLowerCase()}</span>
                      {p.reference && <span className="text-slate-400 ml-2 text-xs">{p.reference}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-400">{fmtDate(p.receivedOn)} {p.status === 'REVERSED' && <span className="text-red-600 ml-1">reversed</span>}</div>
                      {p.status === 'RECEIVED' && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-700" disabled={busy} onClick={() => {
                          const reason = window.prompt('Reversal reason (bounced cheque, refund…):')
                          if (reason) void mutate(() => api(`/orders/${o.id}/reverse-payment`, { method: 'POST', json: { paymentId: p.id, reason } }), { success: 'Payment reversed — balance updated', onDone: reload })
                        }}>Reverse</Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 text-sm border-t pt-3 flex-wrap">
                  <Field label="Paid"><span className="text-green-700 font-medium">{money(o.paidPaise)}</span></Field>
                  <Field label="Advance required (30%)">{money(o.advanceRequiredPaise)}</Field>
                  <Field label="Balance"><span className={cn('font-medium', balance > 0 ? 'text-amber-700' : 'text-green-700')}>{money(balance)}</span></Field>
                </div>
                {(o.status === 'PENDING_ADVANCE' || balance > 0) && (
                  <PaymentForm orderId={o.id} suggested={o.status === 'PENDING_ADVANCE' ? o.advanceRequiredPaise : balance} onDone={reload} />
                )}
                {o.status === 'PENDING_ADVANCE' && (
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {isDirector
                      ? <>A director override can confirm without payment: <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy} onClick={() => mutate(() => api(`/orders/${o.id}/confirm`, { method: 'POST' }), { success: 'Order confirmed by override', onDone: reload })}>Confirm now</Button></>
                      : 'A director override can confirm without payment — ask the director.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* right column */}
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Customer and site</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Customer"><button className="text-blue-700 underline" onClick={() => nav(`customer/${o.customerId}`)}>{o.customer.name}</button></Field>
                <Field label="Phone">{o.customer.phone}</Field>
                <Field label="Site">{o.customer.addressLine}, {o.customer.city}</Field>
                {o.quote && <Field label="From quote">{o.quote.quoteNumber}</Field>}
              </CardContent>
            </Card>

            {/* installation + crew */}
            {inst && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between">Installation <StageChip status={inst.status} /></CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Field label="Scheduled">{inst.scheduledOn ? `${fmtDate(inst.scheduledOn)} · ${inst.slot?.toLowerCase()}` : 'not scheduled yet'}</Field>
                  <Field label="Crew">{inst.crew?.length ? inst.crew.map((c: any) => c.technician.user.name).join(', ') : 'not confirmed'}</Field>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => nav(`job/${inst.id}`)}><ArrowRight className="h-3.5 w-3.5 mr-1" /> Open job</Button>
                </CardContent>
              </Card>
            )}

            {/* subsidy checklist */}
            {o.subsidy && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Subsidy (tracked manually)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={o.subsidy.status}
                      onChange={(e) => mutate(() => api(`/orders/${o.id}/subsidy`, { method: 'POST', json: { status: e.target.value } }), { success: 'Subsidy updated', onDone: reload })}>
                      {['NOT_STARTED', 'PREPARING', 'SUBMITTED', 'APPROVED', 'DISBURSED', 'REJECTED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}
                    </select>
                  </div>
                  <Field label="Expected">{money(o.subsidy.expectedPaise)}</Field>
                  <Field label="Reference">{o.subsidy.applicationRef ?? '—'}</Field>
                  <p className="text-xs text-slate-400">Portal integration is out of scope (C13) — this checklist keeps the status in one place.</p>
                </CardContent>
              </Card>
            )}

            {['PENDING_ADVANCE', 'CONFIRMED', 'READY_TO_DISPATCH'].includes(o.status) && (
              <Card className="border-red-100">
                <CardHeader className="pb-2"><CardTitle className="text-base text-slate-500">Danger zone</CardTitle></CardHeader>
                <CardContent>
                  {isDirector ? (
                    <>
                      <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => {
                        const reason = window.prompt('Cancellation reason (required):')
                        if (reason) void mutate(() => api(`/orders/${o.id}/cancel`, { method: 'POST', json: { reason } }), { success: 'Order cancelled — reservations released and refund recorded', onDone: reload })
                      }}><Ban className="h-3.5 w-3.5 mr-1" /> Cancel order</Button>
                      <p className="text-xs text-slate-400 mt-2">Cancelling releases reservations, returns picked units to the warehouse and records the refund (director-only, T38R7).</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Order cancellation is a director decision — the release of stock and any refund needs the director's sign-off.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    )
  }
}

function PaymentForm({ orderId, suggested, onDone }: { orderId: string; suggested: number; onDone: () => void }) {
  const [amount, setAmount] = useState(suggested / 100)
  const [method, setMethod] = useState('UPI')
  const [kind, setKind] = useState('ADVANCE')
  const [reference, setReference] = useState('')
  const { busy, mutate } = useMutation()
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="text-sm font-medium flex items-center gap-1.5"><Wallet className="h-4 w-4 text-slate-500" /> Record a payment</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1"><Label>Amount (Rs)</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="space-y-1"><Label>Method</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
            {['UPI', 'NEFT', 'CASH', 'CHEQUE', 'LOAN'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>Kind</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            {['ADVANCE', 'PART', 'FINAL'].map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1"><Label>Reference (UTR / cheque no.)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" /></div>
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || amount <= 0} onClick={() => mutate(() => api(`/orders/${orderId}/payments`, {
          method: 'POST', json: { amountRupees: amount, method, reference: reference || undefined, kind },
        }), { success: 'Payment recorded', onDone })}>Save payment</Button>
      </div>
    </div>
  )
}

// ── S10: schedule (week grid + crew suggestions) ──────────────────

export function ScheduleView() {
  const { data, loading, reload } = useData(() => api('/installations'), [])
  const { data: techs } = useData(() => api('/technicians'), [])
  const installations = data?.installations ?? []
  const pending = installations.filter((i: any) => i.status === 'SCHEDULED' && i.scheduledOn)
  const unscheduled = installations.filter((i: any) => !i.scheduledOn && ['SCHEDULED'].includes(i.status))

  // week grid: next 7 days
  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(Date.now() + k * 86400000)
    return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10)
  })
  const crewLeads = (techs?.technicians ?? []).filter((t: any) => t.isCrewLead)

  return (
    <div className="space-y-5">
      <PageHeader title="Schedule" sub={`${pending.length} jobs scheduled this week · ${unscheduled.length} awaiting crew confirmation`} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">This week</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[760px]">
            {days.map((day) => {
              const jobs = installations.filter((i: any) => i.scheduledOn === day && i.status !== 'COMPLETED')
              const isToday = day === todayStr()
              return (
                <div key={day} className={cn('rounded-lg border p-2 min-h-32', isToday ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200')}>
                  <div className={cn('text-xs font-semibold mb-2', isToday ? 'text-blue-700' : 'text-slate-500')}>
                    {fmtDate(day).slice(0, 6)}{isToday ? ' · today' : ''}
                  </div>
                  <div className="space-y-1.5">
                    {jobs.map((i: any) => (
                      <button key={i.id} onClick={() => nav(`job/${i.id}`)} className="w-full rounded-md border border-slate-200 bg-white p-2 text-left hover:border-blue-400 transition">
                        <div className="text-[11px] font-medium truncate">{i.order.customer.name}</div>
                        <div className="text-[10px] text-slate-400">{i.order.capacityKw} kW · {i.slot?.slice(0, 3)}</div>
                        <StageChip status={i.status} className="mt-1 !text-[9px]" />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {unscheduled.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Awaiting crew and date</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {unscheduled.map((i: any) => <ScheduleRow key={i.id} installation={i} crewLeads={crewLeads} onDone={reload} />)}
          </CardContent>
        </Card>
      )}
      {loading && <Loading rows={3} />}
    </div>
  )
}

function ScheduleRow({ installation, crewLeads, onDone }: { installation: any; crewLeads: any[]; onDone: () => void }) {
  const [date, setDate] = useState(todayStr())
  const [slot, setSlot] = useState('MORNING')
  const [leadId, setLeadId] = useState('')
  const { busy, mutate } = useMutation()
  const { data: sugg } = useData(() => api(`/installations/${installation.id}/crew-suggestions`), [installation.id])
  const suggestions = sugg?.suggestions ?? []

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">{installation.order.orderNumber} · {installation.order.customer.name}</div>
          <div className="text-xs text-slate-400">{installation.order.capacityKw} kW {installation.order.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} · {installation.order.customer.addressLine}</div>
        </div>
        <StageChip status={installation.order.status} />
      </div>

      {/* ranked suggestions with score breakdown */}
      {suggestions.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-2">
          {suggestions.map((s: any, idx: number) => {
            const bd = typeof s.breakdown === 'string' ? JSON.parse(s.breakdown) : s.breakdown
            return (
              <button key={s.id ?? idx} onClick={() => setLeadId(typeof s.technicianIds === 'string' ? s.technicianIds.split(',')[0] : (s.technicianIds ?? [])[0])}
                className={cn('rounded-lg border p-2.5 text-left transition', idx === 0 ? 'border-green-300 bg-green-50/50' : 'border-slate-200 hover:border-slate-300')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Rank {s.rank} · score {s.score.toFixed(2)}</span>
                  {idx === 0 && <span className="text-[10px] bg-green-600 text-white rounded px-1.5 py-0.5">best</span>}
                </div>
                <div className="text-xs text-slate-600 mt-1">{bd?.names?.join(', ')}</div>
                <div className="text-[10px] text-slate-400 mt-1">skill {bd?.skill} · proximity {bd?.proximity} · workload {bd?.workload} · continuity {bd?.continuity}</div>
                {bd?.reasons?.[0] && <div className="text-[10px] text-slate-500 mt-1">{bd.reasons[0]}</div>}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="space-y-1"><Label>Slot</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="MORNING">Morning</option><option value="AFTERNOON">Afternoon</option>
          </select>
        </div>
        <div className="space-y-1"><Label>Crew lead</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Choose…</option>
            {crewLeads.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Button size="sm" disabled={!leadId || busy} onClick={() => mutate(() => api(`/installations/${installation.id}/schedule`, {
          method: 'POST', json: { scheduledOn: date, slot, crewLeadId: leadId },
        }), { success: 'Crew and date confirmed — dispatch moves to ready', onDone })}>Confirm crew</Button>
      </div>
    </div>
  )
}
