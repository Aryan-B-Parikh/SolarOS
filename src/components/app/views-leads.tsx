// Leads (S2, S3, S4, S6): stage board with SLA badges and duplicate flags,
// lead detail with the call checklist, AI site assessment panel, survey
// scheduling and manager review that unlocks quoting.

'use client'

import { useState } from 'react'
import { api, money, fmtDate, num, useData, useMutation, LEAD_STAGES, nav, todayStr, useHashRoute, toDateStr } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, EmptyState, Field, Loading, NextStepPanel, PageHeader, SlaBadge, StageChip, Timeline, PhotoThumb } from './shared'
import { Copy, Users, FileText, Sun, Sparkles, ShieldAlert, Camera, CheckCircle2, XCircle, AlertTriangle, PhoneCall, MapPin, CalendarPlus } from 'lucide-react'

// ── S2: lead board ────────────────────────────────────────────────

const BOARD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'SURVEY_APPROVED', 'QUOTED']

export function LeadBoardView() {
  const [ownerFilter, setOwnerFilter] = useState('')
  const { data, loading, reload } = useData(() => api(`/leads${ownerFilter ? `?ownerId=${ownerFilter}` : ''}`), [ownerFilter])
  // FR-1.3: owner chips derived from the loaded leads' real owners
  const ownerChipMap = new Map<string, string>()
  for (const l of data?.leads ?? []) {
    if (l.ownerId && l.ownerName) ownerChipMap.set(l.ownerId, l.ownerName)
  }
  const ownerChips: { id: string; name: string }[] = [...ownerChipMap].map(([id, name]) => ({ id, name }))

  const leads = (data?.leads ?? []).filter((l: any) => !['WON', 'LOST', 'DISQUALIFIED'].includes(l.status))
  const won = (data?.leads ?? []).filter((l: any) => l.status === 'WON')

  return (
    <div>
      <PageHeader
        title="Leads"
        sub={`${leads.length} open · ${won.length} won`}
        actions={<ManualEnquiryButton onDone={reload} />}
      />
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setOwnerFilter('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !ownerFilter ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500')}>All sales</button>
        {ownerChips.map((o: any) => (
          <button key={o.id} onClick={() => setOwnerFilter(o.id)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', ownerFilter === o.id ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500')}>{o.name}</button>
        ))}
      </div>
      {loading ? <Loading rows={4} /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {BOARD_STAGES.map((stage) => {
            const stageLeads = leads.filter((l: any) => l.status === stage)
            return (
              <div key={stage} className="rounded-lg border border-slate-200 bg-slate-100/60 p-2 min-h-40">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="text-xs font-semibold text-slate-600">{LEAD_STAGES.find((s) => s.key === stage)?.label}</span>
                  <span className="text-xs text-slate-400">{stageLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((l: any) => (
                    <button key={l.id} onClick={() => nav(`leads/${l.id}`)}
                      className="w-full text-left rounded-lg border bg-white p-2.5 hover:border-blue-400 hover:shadow-sm transition">
                      <div className="text-sm font-medium truncate">{l.customer.name}</div>
                      <div className="text-[11px] text-slate-400">{l.leadNumber} · {l.source.replace('_', ' ').toLowerCase()}</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {l.requestedCapacityKw ? <span className="text-[10px] font-medium rounded bg-slate-100 px-1.5 py-0.5">{l.requestedCapacityKw} kW</span> : null}
                        {l.duplicateFlags.length > 0 && <span title="Duplicate flag" className="text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 inline-flex items-center gap-0.5"><Copy className="h-2.5 w-2.5" />dup</span>}
                        {stage === 'NEW' && <SlaBadge dueAt={l.slaDueAt} />}
                      </div>
                    </button>
                  ))}
                  {stageLeads.length === 0 && <div className="text-[11px] text-slate-400 text-center py-4">—</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {won.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-600 mb-2">Won ({won.length})</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {won.slice(0, 8).map((l: any) => (
              <button key={l.id} onClick={() => nav(`leads/${l.id}`)} className="rounded-lg border bg-green-50/50 border-green-200 p-2.5 text-left hover:shadow-sm transition">
                <div className="text-sm font-medium truncate">{l.customer.name}</div>
                <div className="text-[11px] text-slate-400">{l.leadNumber} · {fmtDate(l.createdAt?.slice(0, 10))}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ManualEnquiryButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', addressLine: '', city: '', pincode: '', source: 'WHATSAPP', monthlyBillRupees: 2500, requestedCapacityKw: 3, consent: true })
  const { busy, mutate } = useMutation()
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}><PhoneCall className="h-3.5 w-3.5 mr-1" /> Log enquiry</Button>
  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4" onClick={() => setOpen(false)}>
      <Card className="w-full max-w-lg" onClick={(e: any) => e.stopPropagation?.()}>
        <CardHeader className="pb-3"><CardTitle className="text-base">Log a WhatsApp / phone / walk-in enquiry</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.addressLine} onChange={(e) => set('addressLine', e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
            <div className="space-y-1"><Label>Pincode</Label><Input value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
            <div className="space-y-1"><Label>Source</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={form.source} onChange={(e) => set('source', e.target.value)}>
                <option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone call</option><option value="WALK_IN">Walk-in</option><option value="REFERRAL">Referral</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Monthly bill (₹)</Label><Input type="number" value={form.monthlyBillRupees} onChange={(e) => set('monthlyBillRupees', Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Capacity (kW)</Label><Input type="number" value={form.requestedCapacityKw} onChange={(e) => set('requestedCapacityKw', Number(e.target.value))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={busy || !form.name || form.phone.replace(/\D/g, '').length < 10} onClick={() => mutate(async () => {
              const r = await api('/leads', { method: 'POST', json: form })
              return r
            }, { success: 'Lead logged and assigned', onDone: () => { setOpen(false); onDone() } })}>Save lead</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── S3/S4/S6: lead detail ─────────────────────────────────────────

export function LeadDetailView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/leads/${id}`), [id])
    const { busy, mutate } = useMutation()

    if (loading) return <Loading rows={5} />
    if (error) return <Alert tone="warn" title="Lead not found">{error}</Alert>

    const lead = data.lead
    const customer = lead.customer
    const survey = lead.surveys?.[0]
    const assessment = lead.assessments?.[0]
    const openFlags = lead.duplicateFlags.filter((f: any) => f.status === 'OPEN')

    const next = nextStepFor(lead, survey)

    const transition = (to: string, extra?: Record<string, unknown>) =>
      mutate(() => api(`/leads/${id}/transitions`, { method: 'POST', json: { to, ...extra } }), { success: 'Lead updated', onDone: reload })

    return (
      <div className="space-y-5">
        <PageHeader
          back={{ label: 'Leads', to: 'leads' }}
          title={customer.name}
          sub={`${lead.leadNumber} · ${lead.source.replace('_', ' ').toLowerCase()} · owner ${lead.ownerId === lead.customerId ? '' : ''}${lead.leadNumber ? '' : ''}stage: ${lead.status.replace(/_/g, ' ').toLowerCase()}`}
          actions={<StageChip status={lead.status} />}
        />

        {next && <NextStepPanel title={next.title} action={next.action ? <Button size="sm" disabled={busy} onClick={next.action}>{next.label}</Button> : undefined}>{next.hint}</NextStepPanel>}

        {openFlags.length > 0 && (
          <Alert tone="warn" title="Possible duplicate enquiry" icon={<ShieldAlert className="h-4 w-4" />}>
            <div className="space-y-2 mt-1">
              {openFlags.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between gap-3 flex-wrap text-sm">
                  <span>Address looks like an existing customer ({Math.round(f.score * 100)}% similar). Nothing was merged.</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api(`/leads/${id}/resolve-duplicate`, { method: 'POST', json: { flagId: f.id, action: 'LINKED' } }), { success: 'Flag linked', onDone: reload })}>Link</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => mutate(() => api(`/leads/${id}/resolve-duplicate`, { method: 'POST', json: { flagId: f.id, action: 'DISMISSED' } }), { success: 'Flag dismissed', onDone: reload })}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* qualification checklist */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Call checklist (qualification)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <QualificationForm lead={lead} onSaved={reload} />
              </CardContent>
            </Card>

            {/* assessment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Sun className="h-4 w-4 text-amber-500" /> Site assessment (AI summary)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {assessment ? <AssessmentPanel assessment={assessment} /> : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-slate-500">Run the calculator on the qualification inputs to size the system and estimate savings.</p>
                    <Button size="sm" disabled={busy || !lead.monthlyBillPaise} onClick={() => mutate(() => api(`/leads/${id}/assessments`, { method: 'POST' }), { success: 'Assessment ready', onDone: reload })}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Run assessment
                    </Button>
                  </div>
                )}
                {!lead.monthlyBillPaise && !lead.monthlyUnits && <p className="text-xs text-slate-400">Enter the monthly bill or units in the checklist first.</p>}
              </CardContent>
            </Card>

            {/* survey */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Site survey</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {survey ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <StageChip status={survey.status} />
                      <span className="text-xs text-slate-400">scheduled {fmtDate(toDateStr(survey.scheduledAt))}</span>
                    </div>
                    {survey.status === 'COMPLETED' || survey.status === 'APPROVED' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Field label="Roof type">{survey.roofType ?? '—'}</Field>
                        <Field label="Direction">{survey.azimuthDeg != null ? `${survey.azimuthDeg}°` : '—'}</Field>
                        <Field label="Tilt">{survey.tiltDeg != null ? `${survey.tiltDeg}°` : '—'}</Field>
                        <Field label="Usable area">{survey.usableAreaSqm ? `${survey.usableAreaSqm} m²` : '—'}</Field>
                        <Field label="Shading">{survey.shading?.toLowerCase() ?? '—'}</Field>
                        <Field label="Cable run">{survey.cableDistanceM ? `${survey.cableDistanceM} m` : '—'}</Field>
                        <Field label="Structure height">{survey.structureHeightM ? `${survey.structureHeightM} m` : '—'}</Field>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">The surveyor fills the measurements on their phone (Today → open survey).</p>
                    )}
                    {survey.status === 'COMPLETED' && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy} onClick={() => mutate(() => api(`/surveys/${survey.id}/review`, { method: 'POST', json: { decision: 'APPROVED' } }), { success: 'Survey approved — quoting unlocked', onDone: reload })}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve survey
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                          const reason = window.prompt('Reason for rejection (required):')
                          if (reason) void mutate(() => api(`/surveys/${survey.id}/review`, { method: 'POST', json: { decision: 'REJECTED', reason } }), { success: 'Survey rejected', onDone: reload })
                        }}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                        <span className="text-xs text-slate-400 self-center">Requires director approval</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <ScheduleSurvey lead={lead} onDone={reload} />
                )}
              </CardContent>
            </Card>

            {/* quotes list */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Quotes</CardTitle></CardHeader>
              <CardContent>
                {lead.quotes.length === 0 ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-slate-500">No quote yet. {lead.status === 'SURVEY_APPROVED' ? 'The survey is approved — a quote can be created.' : 'A quote can be created after the survey is approved.'}</p>
                    <Button size="sm" disabled={lead.status !== 'SURVEY_APPROVED' && lead.status !== 'QUOTED'} onClick={() => nav(`quotes/new/${id}`)}>Create quote</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lead.quotes.map((q: any) => (
                      <button key={q.id} onClick={() => nav(`quotes/${q.id}`)} className="w-full rounded-lg border p-3 flex items-center justify-between gap-3 hover:border-blue-400 transition text-left">
                        <div>
                          <div className="text-sm font-medium">{q.quoteNumber} · v{q.version} · {q.capacityKw} kW</div>
                          <div className="text-xs text-slate-400">{money(q.totalPaise)} total · {q.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'}</div>
                        </div>
                        <StageChip status={q.status} />
                      </button>
                    ))}
                    <Button size="sm" variant="outline" disabled={lead.status !== 'SURVEY_APPROVED' && lead.status !== 'QUOTED'} onClick={() => nav(`quotes/new/${id}`)}>New quote</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* right column: customer + activity */}
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Customer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Name">{customer.name} <span className="text-xs text-slate-400">({customer.customerNumber})</span></Field>
                <Field label="Phone">{customer.phone}</Field>
                <Field label="Address"><span className="inline-flex items-start gap-1"><MapPin className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />{customer.addressLine}, {customer.city} {customer.pincode}</span></Field>
                <div className="pt-1 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => nav(`customer/${customer.id}`)}>Customer page</Button>
                  <PortalLinkButton customerId={customer.id} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
              <CardContent>
                <Timeline items={lead.activities.map((a: any) => ({ at: a.createdAt, title: a.type === 'STATUS_CHANGE' ? 'Status change' : a.type === 'CALL' ? 'Call logged' : a.type.charAt(0) + a.type.slice(1).toLowerCase(), body: a.body }))} />
              </CardContent>
            </Card>
            {(lead.status !== 'WON' && lead.status !== 'LOST' && lead.status !== 'DISQUALIFIED') && (
              <Card className="border-slate-200">
                <CardHeader className="pb-3"><CardTitle className="text-base text-slate-500">Close lead</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                  <p className="text-xs text-slate-400">Leads are never deleted — only closed with a reason.</p>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                    const reason = window.prompt('Reason (required):')
                    if (reason) void transition('LOST', { reason })
                  }}>Close as lost</Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    )
  }
}

function nextStepFor(lead: any, survey: any): { title: string; hint: string; label?: string; action?: () => void } | null {
  switch (lead.status) {
    case 'NEW': return { title: 'Call the customer and log the first contact', hint: 'Mark the lead contacted once you have spoken — the SLA timer stops.' }
    case 'CONTACTED': return { title: 'Complete the call checklist', hint: 'Roof area, monthly bill and grid suitability unlock the assessment.' }
    case 'QUALIFIED': return { title: 'Schedule the site survey', hint: 'Pick a surveyor; the job appears on their Today list.' }
    case 'SURVEY_SCHEDULED': return { title: 'Wait for the survey, then approve it', hint: survey ? `Survey ${survey.status.toLowerCase()} — measurements by the technician.` : '' }
    case 'SURVEY_APPROVED': return { title: 'Create and send the quote', hint: 'The BOM engine lists every part automatically.' }
    case 'QUOTED': return { title: 'Follow up on the quotation', hint: 'The customer can accept from their link; a rejection keeps the lead here for a revision.' }
    default: return null
  }
}

function PortalLinkButton({ customerId }: { customerId: string }) {
  const { busy, mutate } = useMutation()
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(async () => {
      const r = await api(`/customers/${customerId}/access-links`, { method: 'POST' })
      return r
    }, {
      success: 'Fresh portal link issued (sent by SMS)',
      onDone: (r: any) => {
        window.open(`#/p/${r.token}`, '_blank')
      },
    })}>Open customer view</Button>
  )
}

function QualificationForm({ lead, onSaved }: { lead: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    roofAreaSqm: lead.roofAreaSqm ?? '',
    monthlyBillRupees: lead.monthlyBillPaise ? lead.monthlyBillPaise / 100 : '',
    monthlyUnits: lead.monthlyUnits ?? '',
    gridOk: lead.gridOk ?? true,
    sanctionedLoadKw: lead.sanctionedLoadKw ?? '',
    phase: lead.phase ?? 'SINGLE',
  })
  const [showMissing, setShowMissing] = useState(false)
  const { busy, mutate } = useMutation()
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  // The server requires roof area + (monthly bill OR monthly units) + grid
  // answer before a lead can be marked QUALIFIED (services/leads.ts).
  const areaMissing = String(form.roofAreaSqm).trim() === ''
  const billOrUnitsMissing = String(form.monthlyBillRupees).trim() === '' && String(form.monthlyUnits).trim() === ''
  const checklistComplete = !areaMissing && !billOrUnitsMissing

  const patchJson = {
    roofAreaSqm: form.roofAreaSqm === '' ? null : Number(form.roofAreaSqm),
    monthlyBillRupees: form.monthlyBillRupees === '' ? null : Number(form.monthlyBillRupees),
    monthlyUnits: form.monthlyUnits === '' ? null : Number(form.monthlyUnits),
    gridOk: form.gridOk,
    sanctionedLoadKw: form.sanctionedLoadKw === '' ? null : Number(form.sanctionedLoadKw),
    phase: form.phase,
  }

  const markQualified = () => {
    if (!checklistComplete) {
      setShowMissing(true)
      toast.error('Complete the call checklist first: shadow-free roof area and monthly bill or units.')
      return
    }
    // Save the checklist and qualify in one click — the server checks the
    // saved lead, so the PATCH must land before the transition.
    mutate(async () => {
      await api(`/leads/${lead.id}`, { method: 'PATCH', json: patchJson })
      return api(`/leads/${lead.id}/transitions`, { method: 'POST', json: { to: 'QUALIFIED' } })
    }, { success: 'Lead qualified — next: schedule the site survey', onDone: onSaved })
  }

  const bad = (missing: boolean) => (showMissing && missing ? 'border-red-400 focus-visible:ring-red-200' : undefined)

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1"><Label>Shadow-free roof area (m²) *</Label><Input type="number" value={form.roofAreaSqm} onChange={(e) => set('roofAreaSqm', e.target.value)} className={bad(areaMissing)} aria-invalid={showMissing && areaMissing} /></div>
        <div className="space-y-1"><Label>Monthly bill (₹) *</Label><Input type="number" value={form.monthlyBillRupees} onChange={(e) => set('monthlyBillRupees', e.target.value)} className={bad(billOrUnitsMissing)} aria-invalid={showMissing && billOrUnitsMissing} /></div>
        <div className="space-y-1"><Label>or monthly units (kWh) *</Label><Input type="number" value={form.monthlyUnits} onChange={(e) => set('monthlyUnits', e.target.value)} className={bad(billOrUnitsMissing)} aria-invalid={showMissing && billOrUnitsMissing} /></div>
        <div className="space-y-1"><Label>Grid connection OK?</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={String(form.gridOk)} onChange={(e) => set('gridOk', e.target.value === 'true')}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        </div>
        <div className="space-y-1"><Label>Sanctioned load (kW)</Label><Input type="number" value={form.sanctionedLoadKw} onChange={(e) => set('sanctionedLoadKw', e.target.value)} /></div>
        <div className="space-y-1"><Label>Phase</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={form.phase} onChange={(e) => set('phase', e.target.value)}>
            <option value="SINGLE">Single</option><option value="THREE">Three</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400">* fill roof area and either bill or units — these unlock qualification and the site assessment.</p>
      <div className="flex justify-end gap-2 items-center flex-wrap">
        {lead.status === 'CONTACTED' && !checklistComplete && (
          <span className="mr-auto text-xs text-amber-700">Roof area and monthly bill or units are needed before this lead can be qualified.</span>
        )}
        {lead.status === 'NEW' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api(`/leads/${lead.id}/transitions`, { method: 'POST', json: { to: 'CONTACTED' } }), { success: 'Marked contacted', onDone: onSaved })}>Log first call</Button>
        )}
        <Button size="sm" disabled={busy} onClick={() => mutate(() => api(`/leads/${lead.id}`, { method: 'PATCH', json: patchJson }), { success: 'Checklist saved', onDone: onSaved })}>Save checklist</Button>
        {lead.status === 'CONTACTED' && (
          <Button size="sm" disabled={busy} onClick={markQualified}>Mark qualified</Button>
        )}
      </div>
    </div>
  )
}

function AssessmentPanel({ assessment }: { assessment: any }) {
  const risks: string[] = assessment.aiRisks ? JSON.parse(assessment.aiRisks) : []
  const photo = assessment.photoFindings ? JSON.parse(assessment.photoFindings) : null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-semibold">{assessment.recommendedKw} kW</div>
          <div className="text-[11px] text-slate-500">recommended</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-semibold tabular-nums">{num(assessment.annualGenerationKwh)}</div>
          <div className="text-[11px] text-slate-500">kWh / year (est.)</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-semibold tabular-nums">{money(assessment.annualSavingsPaise)}</div>
          <div className="text-[11px] text-slate-500">saved / year (est.)</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-semibold">{assessment.paybackYears ? `${assessment.paybackYears} yr` : '—'}</div>
          <div className="text-[11px] text-slate-500">payback (est.)</div>
        </div>
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> AI summary {assessment.aiModel ? `· ${assessment.aiModel}` : '· templated fallback'}
        </div>
        <p className="text-sm text-slate-700">{assessment.aiSummary}</p>
        {risks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {risks.map((r: string) => <span key={r} className="text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{r}</span>)}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">All figures are estimates from the calculator; the AI only explains and flags risks. Every number is labelled Estimate.</p>
      </div>
      {photo && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Advisory photo observations</div>
          <ul className="text-sm text-slate-700 space-y-0.5 list-disc pl-4">
            {photo.observations?.map((o: string, i: number) => <li key={i}>{o}</li>)}
          </ul>
          <p className="text-[11px] text-slate-400 mt-1">Advisory only — never changes a calculated number or the approval.</p>
        </div>
      )}
    </div>
  )
}

function ScheduleSurvey({ lead, onDone }: { lead: any; onDone: () => void }) {
  const { data: techs } = useData(() => api('/technicians'), [])
  const [surveyorUserId, setSurveyorUserId] = useState('')
  const [when, setWhen] = useState(todayStr() + 'T10:00')
  const { busy, mutate } = useMutation()
  const surveyors = (techs?.technicians ?? []).filter((t: any) => t.skills.includes('SURVEY'))

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Book the technician visit; the customer is notified and the job appears on the surveyor&apos;s Today list.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Surveyor</Label>
          <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={surveyorUserId} onChange={(e) => setSurveyorUserId(e.target.value)}>
            <option value="">Choose a surveyor…</option>
            {surveyors.map((t: any) => <option key={t.id} value={t.userId}>{t.name}{t.isCrewLead ? ' · crew lead' : ''}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>Date and time</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!surveyorUserId || busy} onClick={() => mutate(() => api(`/leads/${lead.id}/surveys`, {
          method: 'POST', json: { surveyorId: surveyorUserId, scheduledAt: new Date(when).toISOString() },
        }), { success: 'Survey scheduled — customer notified', onDone })}>
          <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Schedule survey
        </Button>
      </div>
    </div>
  )
}
