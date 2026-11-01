// Service (S17, S18): the service desk with one search box, the customer view
// with warranty bars, and ticket detail with the warranty verdict banner,
// fault codes, parts and replacement scan, billing preview and the
// customer-confirmation close.

'use client'

import { useRef, useState } from 'react'
import { api, money, fmtDate, fmtDateTime, num, useData, useMutation, nav, VERDICT_COPY, daysUntil, useHashRoute } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, EmptyState, Field, Loading, PageHeader, StageChip, Timeline, WarrantyBar, SerialBadge } from './shared'
import { Search, Wrench, ShieldCheck, ArrowRight, PhoneCall, CheckCircle2, RotateCcw, User, Plus, Camera, Loader2, FileText } from 'lucide-react'

export function ServiceDeskView() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState<any>(null)
  const [newTicket, setNewTicket] = useState(false)
  const { data: ticketsData, loading, reload } = useData(() => api('/tickets'), [])
  const tickets = ticketsData?.tickets ?? []

  const doSearch = async () => {
    if (q.trim().length < 2) return
    try {
      setSearch(await api(`/search?q=${encodeURIComponent(q.trim())}`))
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Service desk"
        sub="Find by phone, name, serial, order or ticket — warranty status in seconds (C9)"
        actions={<Button size="sm" onClick={() => setNewTicket(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New ticket</Button>}
      />
      {newTicket && <NewTicketDialog onDone={() => { setNewTicket(false); reload() }} onCancel={() => setNewTicket(false)} />}

      <Card className="border-2 border-slate-200 focus-within:border-blue-400 transition">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Search className="h-5 w-5 text-slate-400 mt-2.5 ml-1" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="Type a phone number, serial, name or ticket number…" className="text-base border-0 shadow-none focus-visible:ring-0 px-1" />
            <Button onClick={doSearch}>Search</Button>
          </div>
          {search && (
            <div className="mt-3 space-y-2">
              {search.customers.map((c: any) => (
                <button key={c.id} onClick={() => nav(`customer/${c.id}`)} className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:border-blue-400 transition">
                  <div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.phone} · {c.customerNumber}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
              {search.units.map((u: any) => (
                <button key={u.id} onClick={() => nav(`customer/${u.customerId}`)} className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:border-blue-400 transition">
                  <div>
                    <div className="text-sm font-semibold">{u.product.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{u.serialNumber} · {u.status.replace(/_/g, ' ').toLowerCase()}</div>
                  </div>
                  {u.warranties.find((w: any) => w.status === 'ACTIVE')
                    ? <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">in warranty until {fmtDate(u.warranties.find((w: any) => w.status === 'ACTIVE').endDate)}</span>
                    : <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">no active warranty</span>}
                </button>
              ))}
              {search.customers.length === 0 && search.units.length === 0 && <div className="text-sm text-slate-500 p-2">No customer or unit found for “{q}”.</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="text-sm font-semibold text-slate-600 mb-2">Recent tickets</div>
        {loading ? <Loading rows={3} /> : tickets.length === 0 ? <EmptyState title="No tickets yet" hint="Search a customer to open one." /> : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Ticket</th><th className="px-3 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">Unit</th>
                <th className="px-3 py-2.5 font-medium">Verdict</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium text-right">SLA</th>
              </tr></thead>
              <tbody>
                {tickets.map((t: any) => {
                  const v = VERDICT_COPY[t.warrantyVerdict]
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`ticket/${t.id}`)}>
                      <td className="px-4 py-2.5 font-medium">{t.ticketNumber}</td>
                      <td className="px-3 py-2.5">{t.customer.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{t.unit?.product.name ?? '—'}</td>
                      <td className="px-3 py-2.5"><span className={cn('text-xs font-medium rounded px-1.5 py-0.5', v?.tone === 'done' ? 'bg-green-50 text-green-700' : v?.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')}>{v?.label}</span></td>
                      <td className="px-3 py-2.5"><StageChip status={t.status} /></td>
                      <td className={cn('px-4 py-2.5 text-right text-xs', new Date(t.slaDueAt) < new Date() && t.status !== 'CLOSED' ? 'text-red-600 font-medium' : 'text-slate-400')}>{fmtDateTime(t.slaDueAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent></Card>
        )}
      </div>
    </div>
  )
}

// ── ticket detail (S18) ───────────────────────────────────────────

export function TicketDetailView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/tickets/${id}`), [id])
    const { busy, mutate } = useMutation()
    const [resolve, setResolve] = useState(false)

    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Ticket not found">{error}</Alert>
    const t = data.ticket
    const v = VERDICT_COPY[t.warrantyVerdict]
    const warranty = t.warranty

    return (
      <div className="space-y-5 max-w-4xl">
        <PageHeader
          back={{ label: 'Service desk', to: 'service' }}
          title={t.ticketNumber}
          sub={`${t.customer.name} · ${t.category.replace(/_/g, ' ').toLowerCase()}${t.faultCode ? ` · fault ${t.faultCode}` : ''} · ${t.priority.toLowerCase()} priority`}
          actions={<StageChip status={t.status} />}
        />

        {/* verdict banner */}
        <div className={cn('rounded-lg border-2 p-4 flex items-start gap-3',
          v.tone === 'done' ? 'border-green-300 bg-green-50' : v.tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-slate-50')}>
          <ShieldCheck className={cn('h-6 w-6 mt-0.5', v.tone === 'done' ? 'text-green-600' : 'text-amber-600')} />
          <div className="flex-1">
            <div className="font-semibold">
              {v.tone === 'done' ? `In warranty until ${fmtDate(warranty?.endDate ?? '')}: no charge` : v.tone === 'warn' && t.warrantyVerdict === 'OUT_OF_WARRANTY' ? `Warranty ended ${fmtDate(warranty?.endDate ?? '')}: chargeable` : v.label}
            </div>
            <div className="text-sm text-slate-600 mt-0.5">{v.note}. Billing mode: {t.billingMode === 'WARRANTY' ? 'warranty (zero cost)' : 'chargeable'}.</div>
            {warranty && <div className="mt-2 max-w-md"><WarrantyBar start={warranty.startDate} end={warranty.endDate} daysLeft={daysUntil(warranty.endDate)} /></div>}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Complaint</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{t.description}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="Channel">{t.channel.replace(/_/g, ' ').toLowerCase()}</Field>
                  <Field label="Priority">{t.priority}</Field>
                  <Field label="SLA due">{fmtDateTime(t.slaDueAt)}</Field>
                  <Field label="Reopens">{t.reopenCount}</Field>
                </div>
                {t.unit && (
                  <div className="rounded-lg border p-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm">
                      <span className="font-medium">{t.unit.product.name}</span>
                      <SerialBadge serial={t.unit.serialNumber} onClick={() => (window.location.hash = `/w/${t.unit.qrCode}`)} />
                      <span className="text-xs text-slate-400 ml-2">status {t.unit.status.replace(/_/g, ' ').toLowerCase()}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => nav(`customer/${t.customerId}`)}><User className="h-3.5 w-3.5 mr-1" /> Customer</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* T3: ticket photos — object storage with DB fallback, served via /api/v1/files/{id} */}
            <TicketPhotos ticketId={id} photos={t.photos ?? []} onDone={reload} />

            {/* lifecycle actions */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Progress</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {t.status === 'OPEN' && <AssignPanel ticketId={id} onDone={reload} />}
                {t.status === 'ASSIGNED' && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-slate-500">Assigned. The visit is on the technician&apos;s Today list.</div>
                    <Button size="sm" disabled={busy} onClick={() => mutate(() => api(`/tickets/${id}/start`, { method: 'POST' }), { success: 'Visit started — time log running', onDone: reload })}>Start visit</Button>
                  </div>
                )}
                {(t.status === 'IN_PROGRESS' || (t.status === 'RESOLVED' && !resolve)) && !resolve && t.status !== 'RESOLVED' && (
                  <div className="flex justify-end">
                    <Button size="sm" disabled={busy} onClick={() => setResolve(true)}>Record resolution</Button>
                  </div>
                )}
                {resolve && <ResolvePanel ticketId={id} ticket={t} onDone={() => { setResolve(false); reload() }} onCancel={() => setResolve(false)} />}
                {t.status === 'RESOLVED' && (
                  <Alert tone="info" title="Waiting for the customer to confirm the fix">
                    The ticket closes only when the customer confirms — by phone or from their portal (C9).
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" disabled={busy} onClick={() => mutate(() => api(`/tickets/${id}/confirm`, { method: 'POST' }), { success: 'Customer confirmed by phone — ticket closed', onDone: reload })}>
                        <PhoneCall className="h-3.5 w-3.5 mr-1" /> Confirm by phone
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api(`/tickets/${id}/reopen`, { method: 'POST', json: { note: 'Customer reported the issue persists' } }), { success: 'Ticket reopened', onDone: reload })}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Not fixed (reopen)
                      </Button>
                    </div>
                  </Alert>
                )}
                {t.status === 'CLOSED' && <Alert tone="success" title={`Closed after customer confirmation (${t.confirmationMethod?.toLowerCase()})`}>{t.resolutionNotes}</Alert>}
              </CardContent>
            </Card>

            {/* parts */}
            {t.parts.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Parts used</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {t.parts.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                      <div>
                        <span className="font-medium">{p.product.name}</span>
                        <span className="text-slate-400 ml-2">×{num(p.qty)}</span>
                        {p.removedUnitId && <span className="text-xs text-slate-400 ml-2">replacement — old unit to RMA</span>}
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums">{money(p.unitPricePaise * p.qty)}</div>
                        <div className={cn('text-xs', p.chargeable ? 'text-amber-700' : 'text-green-700')}>{p.chargeable ? 'chargeable' : 'warranty — no charge'}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <Timeline items={t.events.map((e: any) => ({ at: e.createdAt, title: e.type.replace(/_/g, ' ').toLowerCase(), body: e.note ?? undefined }))} />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
}

function TicketPhotos({ ticketId, photos, onDone }: { ticketId: string; photos: any[]; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const MAX = 8 * 1024 * 1024
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

  const readFileBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '')
      reader.onerror = () => reject(new Error(`${file.name} could not be read.`))
      reader.readAsDataURL(file)
    })

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    try {
      for (const f of files) {
        if (f.size > MAX) throw new Error(`${f.name} is over the 8 MB limit — resize or remove it.`)
        if (!ALLOWED.includes(f.type)) throw new Error(`${f.name}: only JPEG, PNG, WebP or PDF files are allowed.`)
        await api('/files', {
          method: 'POST',
          json: {
            entityType: 'TICKET',
            entityId: ticketId,
            filename: f.name,
            contentType: f.type,
            dataBase64: await readFileBase64(f),
          },
        })
      }
      toast.success(files.length === 1 ? 'Photo uploaded' : `${files.length} photos uploaded`)
      onDone()
    } catch (e: any) {
      toast.error(e.message ?? 'The upload failed — please try again.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" /> Photos
          <span className="text-xs font-normal text-slate-400">{photos.length > 0 ? `${photos.length} attached` : 'none yet'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => window.open(`/api/v1/files/${p.id}`, '_blank', 'noopener')}
                title={`${p.kind.toLowerCase()} · click to open full size`}
                className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 w-full aspect-[4/3] hover:border-blue-400 transition"
              >
                {p.mime?.startsWith('image/') ? (
                  <img src={`/api/v1/files/${p.id}`} alt="Ticket photo" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full grid place-items-center text-slate-400"><FileText className="h-6 w-6" /></span>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] font-medium text-white text-left">{p.kind.toLowerCase()}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1" />}
            {busy ? 'Uploading…' : 'Add photos'}
          </Button>
          <span className="text-xs text-slate-400">JPEG, PNG, WebP or PDF · up to 8 MB each</span>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
      </CardContent>
    </Card>
  )
}

function AssignPanel({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const { data } = useData(() => api('/technicians'), [])
  const [userId, setUserId] = useState('')
  const { busy, mutate } = useMutation()
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1 flex-1 min-w-48">
        <Label>Assign technician</Label>
        <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Choose…</option>
          {(data?.technicians ?? []).map((t: any) => <option key={t.id} value={t.userId}>{t.name}{t.isCrewLead ? ' · crew lead' : ''}</option>)}
        </select>
      </div>
      <Button size="sm" disabled={!userId || busy} onClick={() => mutate(() => api(`/tickets/${ticketId}/assign`, { method: 'POST', json: { technicianUserId: userId } }), { success: 'Assigned', onDone: reload0(onDone) })}>Assign</Button>
    </div>
  )
}

function reload0(fn: () => void) { return fn }

function ResolvePanel({ ticketId, ticket, onDone, onCancel }: { ticketId: string; ticket: any; onDone: () => void; onCancel: () => void }) {
  const { data: productsData } = useData(() => api('/products'), [])
  const { data: unitsData } = useData(() => api('/inventory/units?status=IN_STOCK'), [])
  const [notes, setNotes] = useState('')
  const [labourHours, setLabourHours] = useState(1)
  const [part, setPart] = useState<{ productId: string; qty: number; isReplacement: boolean; installedUnitId: string }>({ productId: '', qty: 1, isReplacement: false, installedUnitId: '' })
  const { busy, mutate } = useMutation()
  const chargeable = ticket.billingMode === 'CHARGEABLE'
  const partProduct = (productsData?.products ?? []).find((p: any) => p.id === part.productId)
  const labourRate = 45000 // billed ₹450/h (1.5 × cost)
  const billTotal = (chargeable ? (part.productId ? part.qty * (partProduct?.salePricePaise ?? 0) : 0) + labourHours * labourRate : 0)

  return (
    <div className="rounded-lg border-2 border-blue-200 p-3 space-y-3">
      <div className="text-sm font-semibold">Resolution</div>
      <div className="space-y-1">
        <Label>What was done</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Replaced the inverter; old unit shows E04 isolation fault. Tested generation at 2.6 kW." />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Part used</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={part.productId} onChange={(e) => setPart({ ...part, productId: e.target.value })}>
            <option value="">None</option>
            {(productsData?.products ?? []).filter((p: any) => p.category !== 'SERVICE').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Qty</Label>
          <Input type="number" min={1} value={part.qty} onChange={(e) => setPart({ ...part, qty: Number(e.target.value) })} />
        </div>
      </div>
      {part.productId && partProduct?.isSerialized && (
        <div className="rounded-lg bg-slate-50 border p-2.5 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={part.isReplacement} onChange={(e) => setPart({ ...part, isReplacement: e.target.checked })} className="h-4 w-4 accent-blue-700" />
            This is a replacement — old unit to RMA, new unit installed
          </label>
          {part.isReplacement && (
            <div className="space-y-1">
              <Label>Scan / pick the replacement unit (new serial)</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={part.installedUnitId} onChange={(e) => setPart({ ...part, installedUnitId: e.target.value })}>
                <option value="">Choose the new unit…</option>
                {(unitsData?.units ?? []).filter((u: any) => u.productId === part.productId).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.serialNumber}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400">The new unit inherits the remaining warranty period (Q3); the original stays on record as TRANSFERRED.</p>
            </div>
          )}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Labour hours</Label>
          <Input type="number" step="0.5" value={labourHours} onChange={(e) => setLabourHours(Number(e.target.value))} />
        </div>
        <Field label="Billing preview">
          {chargeable
            ? <span className="text-amber-700 font-medium">{money(billTotal)} — invoiced on resolution</span>
            : <span className="text-green-700 font-medium">₹0 — in warranty</span>}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={busy || notes.trim().length < 3 || (part.isReplacement && !part.installedUnitId)} onClick={() => mutate(() => api(`/tickets/${ticketId}/resolve`, {
          method: 'POST',
          json: {
            resolutionNotes: notes, labourHours,
            parts: part.productId ? [{
              productId: part.productId, qty: part.qty,
              removedUnitId: part.isReplacement ? (ticket.unitId ?? null) : null,
              installedUnitId: part.isReplacement ? part.installedUnitId : null,
            }] : [],
          },
        }), { success: chargeable ? 'Resolved — chargeable invoice generated' : 'Resolved — no charge to the customer', onDone })}>Resolve ticket</Button>
      </div>
    </div>
  )
}

function NewTicketDialog({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { data: customersData } = useData(() => api('/customers'), [])
  const [customerId, setCustomerId] = useState('')
  const { data: customerData } = useData(() => (customerId ? api(`/customers/${customerId}`) : Promise.resolve(null)), [customerId])
  const [form, setForm] = useState({ category: 'NO_POWER', description: '', priority: 'NORMAL', faultCode: '' })
  const [unitId, setUnitId] = useState('')
  const { busy, mutate } = useMutation()
  const units = (customerData?.customer?.units ?? []).filter((u: any) => u.status === 'INSTALLED' || u.status === 'DELIVERED')
  const selectedUnit = units.find((u: any) => u.id === unitId)
  const selectedModel = selectedUnit ? (selectedUnit.product.model ?? selectedUnit.product.name) : null
  // FR-7.9: per-model fault-code list (free text still allowed)
  const { data: faultData } = useData(() => (selectedModel ? api(`/fault-codes?model=${encodeURIComponent(selectedModel)}`) : Promise.resolve(null)), [selectedModel])
  const codes = faultData?.codes ?? []

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4" onClick={onCancel}>
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto scroll-thin" onClick={(e: any) => e.stopPropagation?.()}>
        <CardHeader className="pb-3"><CardTitle className="text-base">Open a service ticket</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Customer</Label>
            <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setUnitId('') }}>
              <option value="">Search by name…</option>
              {(customersData?.customers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
            </select>
          </div>
          {units.length > 0 && (
            <div className="space-y-1">
              <Label>Equipment (unit)</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={unitId} onChange={(e) => { setUnitId(e.target.value); setForm((f) => ({ ...f, faultCode: '' })) }}>
                <option value="">System / not unit-specific</option>
                {units.map((u: any) => <option key={u.id} value={u.id}>{u.product.name} · {u.serialNumber}</option>)}
              </select>
              {unitId && (() => {
                const u = units.find((x: any) => x.id === unitId)
                const w = u?.warranties.find((x: any) => x.status === 'ACTIVE')
                return w
                  ? <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">Active warranty until {fmtDate(w.endDate)} — this will be an IN-WARRANTY ticket (no charge)</div>
                  : <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">No active warranty — parts and labour will be billed</div>
              })()}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Category</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="NO_POWER">Not generating</option><option value="FAULT_CODE">Fault code</option>
                <option value="LOW_GENERATION">Low generation</option><option value="DAMAGE">Physical damage</option><option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1"><Label>Priority</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="LOW">Low (7 days)</option><option value="NORMAL">Normal (72 h)</option>
                <option value="HIGH">High (24 h)</option><option value="URGENT">Urgent (4 h)</option>
              </select>
            </div>
          </div>
          {selectedUnit && (
            <div className="space-y-1">
              <Label>Fault code ({selectedModel}) — pick from the list or type your own</Label>
              <Input
                list="fault-code-options"
                value={form.faultCode}
                onChange={(e) => {
                  const code = e.target.value
                  const hit = codes.find((c: any) => c.code === code)
                  setForm((f) => ({ ...f, faultCode: code, priority: hit ? hit.defaultPriority : f.priority }))
                }}
                placeholder="e.g. E02 — or leave empty"
              />
              <datalist id="fault-code-options">
                {codes.map((c: any) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
              </datalist>
              {form.faultCode && codes.find((c: any) => c.code === form.faultCode) && (
                <div className="text-xs text-slate-400">{codes.find((c: any) => c.code === form.faultCode)?.description} · default priority applied</div>
              )}
            </div>
          )}
          <div className="space-y-1"><Label>Description (what the customer reported)</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Inverter shows E04 since morning, no generation" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button size="sm" disabled={busy || !customerId || form.description.trim().length < 2} onClick={() => mutate(() => api('/tickets', {
              method: 'POST',
              json: { customerId, unitId: unitId || null, channel: 'PHONE', category: form.category, description: form.description, priority: form.priority, faultCode: form.faultCode || null },
            }), { success: 'Ticket opened — warranty verdict set automatically', onDone: (r: any) => nav(`ticket/${r.ticket.id}`) })}>Open ticket</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── customers ─────────────────────────────────────────────────────

export function CustomersView() {
  const [q, setQ] = useState('')
  const { data, loading } = useData(() => api(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q])
  const customers = data?.customers ?? []
  return (
    <div className="space-y-4">
      <PageHeader title="Customers" sub={`${customers.length} customers`} />
      <Input placeholder="Search by name, phone or number…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      {loading ? <Loading rows={4} /> : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">Phone</th>
              <th className="px-3 py-2.5 font-medium">Leads</th><th className="px-3 py-2.5 font-medium">Orders</th><th className="px-4 py-2.5 font-medium text-right">Since</th>
            </tr></thead>
            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`customer/${c.id}`)}>
                  <td className="px-4 py-2.5 font-medium">{c.name}<div className="text-[11px] text-slate-400">{c.customerNumber}</div></td>
                  <td className="px-3 py-2.5">{c.phone}</td>
                  <td className="px-3 py-2.5">{c.leads.length}</td>
                  <td className="px-3 py-2.5">{c.orders.length}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fmtDate(c.createdAt?.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  )
}

export function CustomerDetailView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/customers/${id}`), [id])
    const { busy, mutate } = useMutation()
    const [portalToken, setPortalToken] = useState<string | null>(null)

    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Customer not found">{error}</Alert>
    const c = data.customer

    return (
      <div className="space-y-5">
        <PageHeader
          back={{ label: 'Customers', to: 'customers' }}
          title={c.name}
          sub={`${c.customerNumber} · ${c.phone} · ${c.addressLine}, ${c.city} ${c.pincode}`}
          actions={
            <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(async () => {
              const r = await api(`/customers/${id}/access-links`, { method: 'POST' })
              setPortalToken(r.token)
              return r
            }, { success: 'Portal link issued and sent by SMS' })}>Issue portal link</Button>
          }
        />
        {portalToken && (
          <Alert tone="success" title="Customer link ready">
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <code className="text-xs bg-white border rounded px-2 py-1">#/p/{portalToken}</code>
              <Button size="sm" variant="outline" onClick={() => window.open(`#/p/${portalToken}`, '_blank')}>Open My SunPower</Button>
            </div>
          </Alert>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          {/* units + warranties */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Installed equipment and warranties</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {c.units.length === 0 && <p className="text-sm text-slate-500">No delivered units yet.</p>}
              {c.units.map((u: any) => {
                const w = u.warranties.find((x: any) => x.status === 'ACTIVE')
                return (
                  <div key={u.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm font-medium">{u.product.name} <SerialBadge serial={u.serialNumber} onClick={() => (window.location.hash = `/w/${u.qrCode}`)} /></div>
                      <StageChip status={u.status} />
                    </div>
                    {w ? <WarrantyBar start={w.startDate} end={w.endDate} daysLeft={daysUntil(w.endDate)} /> : <div className="text-xs text-slate-400">No active warranty (replaced or voided)</div>}
                    {w && (
                      <WarrantyExclusionActions warranty={w} onDone={reload} />
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* tickets */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Service history</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {c.tickets.length === 0 && <p className="text-sm text-slate-500">No tickets.</p>}
              {c.tickets.map((t: any) => (
                <button key={t.id} onClick={() => nav(`ticket/${t.id}`)} className="w-full rounded-lg border p-2.5 text-left hover:border-blue-400 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.ticketNumber} · {t.unit?.product.name ?? 'system'}</span>
                    <StageChip status={t.status} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{t.description.slice(0, 80)}</div>
                  <div className={cn('text-xs mt-1', t.billingMode === 'WARRANTY' ? 'text-green-700' : 'text-amber-700')}>
                    {VERDICT_COPY[t.warrantyVerdict]?.label} · {t.billingMode === 'WARRANTY' ? 'no charge' : 'chargeable'}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* orders */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Orders</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {c.orders.map((o: any) => (
                <button key={o.id} onClick={() => nav(`orders/${o.id}`)} className="w-full rounded-lg border p-2.5 flex items-center justify-between gap-2 text-left hover:border-blue-400 transition">
                  <div>
                    <div className="text-sm font-medium">{o.orderNumber} · {o.capacityKw} kW</div>
                    <div className="text-xs text-slate-400">{money(o.totalPaise)} · paid {money(o.paidPaise)}</div>
                  </div>
                  <StageChip status={o.status} />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* leads */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Leads</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {c.leads.map((l: any) => (
                <button key={l.id} onClick={() => nav(`leads/${l.id}`)} className="w-full rounded-lg border p-2.5 flex items-center justify-between gap-2 text-left hover:border-blue-400 transition">
                  <div className="text-sm font-medium">{l.leadNumber} · {l.source.replace('_', ' ').toLowerCase()}</div>
                  <StageChip status={l.status} />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
}

// ── FR-7.7 warranty exclusion (photo evidence + supervisor approval) ──

function WarrantyExclusionActions({ warranty, onDone }: { warranty: any; onDone: () => void }) {
  const { data: meData } = useData(() => api('/auth/me'), [])
  const role = meData?.user?.role as string | undefined
  const canRequest = role === 'DIRECTOR' || role === 'SUPPORT'
  const canApprove = role === 'DIRECTOR'
  const { busy, mutate } = useMutation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<File[]>([])

  const uploadEvidence = async (): Promise<string[]> => {
    const ids: string[] = []
    for (const f of photos.slice(0, 6)) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('ownerType', 'WARRANTY')
      fd.append('ownerId', warranty.id)
      fd.append('kind', 'OTHER')
      const res = await fetch('/api/v1/uploads', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('A photo could not be uploaded.')
      const r = await res.json()
      ids.push(r.attachmentId)
    }
    return ids
  }

  if (warranty.status === 'VOID') {
    return <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1">Warranty voided{warranty.voidReason ? ` — ${warranty.voidReason}` : ''} (exclusion approved by the director)</div>
  }

  if (warranty.voidRequestedBy) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 space-y-1.5">
        <div className="text-xs text-amber-900"><span className="font-semibold">Exclusion requested</span> — awaiting director approval. Reason: “{warranty.voidRequestReason}”</div>
        {canApprove && (
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => mutate(() => api(`/warranty/${warranty.id}/void-approve`, { method: 'POST' }), { success: 'Warranty voided', onDone })}>Approve void</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => mutate(() => api(`/warranty/${warranty.id}/void-reject`, { method: 'POST', json: {} }), { success: 'Request rejected — warranty stays active', onDone })}>Reject</Button>
          </div>
        )}
      </div>
    )
  }

  if (!canRequest) return null

  return (
    <div>
      {!open ? (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}><ShieldCheck className="h-3 w-3 mr-1" /> Request warranty exclusion</Button>
      ) : (
        <div className="rounded-lg border p-2.5 space-y-2">
          <div className="text-xs font-medium">Request exclusion (physical damage / tampering) — FR-7.7</div>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the damage or tampering found (min 10 characters)…" />
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="text-xs" onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 6))} />
          {photos.length > 0 && <div className="text-xs text-slate-400">{photos.length} evidence photo{photos.length > 1 ? 's' : ''} — uploaded with the request</div>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" disabled={busy || reason.trim().length < 10} onClick={() => mutate(async () => {
              const attachmentIds = await uploadEvidence()
              return api(`/warranty/${warranty.id}/void-request`, { method: 'POST', json: { reason, attachmentIds } })
            }, { success: 'Exclusion request sent to the director', onDone: () => { setOpen(false); onDone() } })}>Send request</Button>
          </div>
        </div>
      )}
    </div>
  )
}
