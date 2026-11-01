// Field app (S5, S14, S15): Today list, the mobile survey form with photos,
// and the installation job stepper — start with location, mandatory checklist,
// capacity and test reading, three named photos, then the customer sign-off
// screen with the signature pad. Large touch targets, one action per screen.
// FR-6.1 map link + kit list, FR-6.2 tap-captured start/finish location,
// FR-6.7 offline-tough localStorage drafts and retrying photo uploads.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, fmtDate, fmtDateTime, num, useData, useMutation, nav, todayStr, useHashRoute, toDateStr, uuid } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, EmptyState, Field, Loading, PageHeader, SignaturePad, StageChip, uploadPhoto, dataUrlToFile, makeSamplePhoto } from './shared'
import { Sun, MapPin, ClipboardCheck, Camera, PenLine, CheckCircle2, ScanLine, QrCode, PlayCircle, PauseCircle, Navigation, Package, X, Loader2 } from 'lucide-react'

// ── FR-6.7: draft persistence helpers (localStorage, debounced writes) ─

function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null // corrupt, unreadable or SSR (no localStorage) — start clean
  }
}

function saveDraftNow(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full/unavailable — the draft simply is not kept
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Dismissible note shown when a draft was restored from localStorage (FR-6.7) */
function DraftNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900 flex items-start justify-between gap-3">
      <span className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-sky-700" /> Draft restored from this device</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss draft-restored note" className="shrink-0 rounded p-0.5 text-sky-700 hover:bg-sky-100 transition">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── FR-6.2: location capture with graceful fallback ──────────────

const SITE_FALLBACK = { lat: 23.0225, lng: 72.5714 } // Ahmedabad site default

/**
 * Resolves real GPS coords, or the Ahmedabad fallback when geolocation is
 * denied/unavailable/times out (10 s). Never rejects — the start/finish
 * actions must never be blocked by location.
 */
function getCurrentCoords(): Promise<{ lat: number; lng: number; fallback: boolean }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ...SITE_FALLBACK, fallback: true })
      return
    }
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (r: { lat: number; lng: number; fallback: boolean }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    timer = setTimeout(() => finish({ ...SITE_FALLBACK, fallback: true }), 10_000)
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, fallback: false }),
      () => finish({ ...SITE_FALLBACK, fallback: true }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

// ── FR-6.1: Google Maps link for a site address ──────────────────

function mapsHref(cust: { lat?: number | null; lng?: number | null; addressLine: string; city: string; pincode?: string | null }): string {
  const query = cust.lat != null && cust.lng != null
    ? `${cust.lat},${cust.lng}`
    : [cust.addressLine, cust.city, cust.pincode].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function MapLinkButton({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Open site location in Google Maps"
      className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-blue-400 hover:text-blue-700', className)}
    >
      <Navigation className="h-3.5 w-3.5" /> Map
    </a>
  )
}

// ── FR-6.7: photo upload with retry + per-photo status chips ─────

type UploadPhase = 'uploading' | 'retrying' | 'done' | 'failed'

interface PendingPhoto {
  id: string
  file: File
  phase: UploadPhase
  attempt: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const FAILED_CHIP_TITLE = 'Upload failed after 4 attempts. The photo is kept in memory for this session only (files cannot be saved between app reloads) — tap Retry when the network is back.'

/**
 * Wraps uploadPhoto with up to 4 attempts and exponential backoff
 * (500 ms, 1 s, 2 s). Never throws — resolves { ok } so callers can keep
 * failed photos queued in component state with a Retry button and surface
 * failures via toast/state only.
 */
async function uploadPhotoWithRetry(
  file: File,
  ownerType: string,
  ownerId: string,
  kind: string,
  onPhase?: (phase: UploadPhase, attempt: number) => void,
): Promise<{ ok: true; data: { attachmentId: string; url: string } } | { ok: false; error: unknown }> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      onPhase?.(attempt === 1 ? 'uploading' : 'retrying', attempt)
      const data = await uploadPhoto(file, ownerType, ownerId, kind)
      onPhase?.('done', attempt)
      return { ok: true, data }
    } catch (error) {
      if (attempt >= 4) {
        onPhase?.('failed', attempt)
        return { ok: false, error }
      }
      await sleep(500 * 2 ** (attempt - 1)) // 500 ms → 1 s → 2 s
    }
  }
  return { ok: false, error: new Error('Upload failed') } // unreachable
}

/** Same contract as shared PhotoUploader, but with retry + status chips (FR-6.7). */
function RetryPhotoUploader({ ownerType, ownerId, kind, label, photos, onUploaded, sampleSeed = 0 }: {
  ownerType: string
  ownerId: string
  kind: string
  label: string
  photos: { id: string; url: string; kind: string }[]
  onUploaded: () => void
  sampleSeed?: number
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [busy, setBusy] = useState(false)

  const send = useCallback(async (file: File, existingId?: string) => {
    const id = existingId ?? uuid()
    setPending((p) => (existingId
      ? p.map((x) => (x.id === id ? { ...x, phase: 'uploading' as const, attempt: 1 } : x))
      : [...p, { id, file, phase: 'uploading' as const, attempt: 1 }]))
    const res = await uploadPhotoWithRetry(file, ownerType, ownerId, kind, (phase, attempt) => {
      setPending((p) => p.map((x) => (x.id === id ? { ...x, phase, attempt } : x)))
    })
    if (res.ok) {
      // flash the green "done" chip briefly, then swap in the real photo
      setPending((p) => p.map((x) => (x.id === id ? { ...x, phase: 'done' as const } : x)))
      window.setTimeout(() => {
        setPending((p) => p.filter((x) => x.id !== id))
        onUploaded()
      }, 400)
    } else {
      const msg = res.error instanceof Error ? res.error.message : 'Upload failed'
      toast.error(`${label}: ${msg} after 4 attempts — the photo is kept below, tap Retry.`)
    }
  }, [ownerType, ownerId, kind, label, onUploaded])

  const takeFile = useCallback(async (file: File) => {
    setBusy(true)
    try {
      await send(file)
    } finally {
      setBusy(false)
    }
  }, [send])

  const fromSample = useCallback(async () => takeFile(await makeSamplePhoto(label, sampleSeed)), [takeFile, label, sampleSeed])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((p) => (
          <img key={p.id} src={p.url} alt={p.kind} className="rounded-lg border aspect-[4/3] object-cover" />
        ))}
        {pending.map((u) => (
          <div key={u.id} className="rounded-lg border-2 border-dashed border-slate-300 aspect-[4/3] p-2 flex flex-col items-center justify-center gap-1.5 text-center bg-slate-50/50">
            {u.phase === 'failed' ? (
              <>
                <span title={FAILED_CHIP_TITLE} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                  <X className="h-3 w-3" /> failed
                </span>
                <button type="button" onClick={() => void send(u.file, u.id)} className="text-[11px] font-semibold text-blue-700 underline">Retry</button>
              </>
            ) : u.phase === 'done' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                <CheckCircle2 className="h-3 w-3" /> done
              </span>
            ) : (
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                u.phase === 'retrying' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                <Loader2 className="h-3 w-3 animate-spin" />
                {u.phase === 'retrying' ? `retrying ${u.attempt}/4` : 'uploading'}
              </span>
            )}
            <span className="text-[10px] text-slate-400 truncate w-full">{u.file.name}</span>
          </div>
        ))}
        {photos.length === 0 && pending.length === 0 && (
          <button type="button" disabled={busy} onClick={() => void fromSample()}
            className="aspect-[4/3] rounded-lg border-2 border-dashed border-slate-300 grid place-items-center text-slate-500 hover:border-blue-400 hover:text-blue-600 transition text-xs">
            <span className="flex flex-col items-center gap-1"><Camera className="h-5 w-5" />{busy ? 'Uploading…' : `Add ${label.toLowerCase()}`}</span>
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Camera className="h-3.5 w-3.5 mr-1" /> Upload photo
        </Button>
        {photos.length === 0 && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void fromSample()}>
            Use sample photo
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void takeFile(f)
          e.target.value = ''
        }} />
      </div>
    </div>
  )
}

// ── S14: Today ────────────────────────────────────────────────────

export function TodayView() {
  const { data, loading } = useData(() => api('/me/jobs'), [])
  const j = data
  const all = [...(j?.surveys ?? []), ...(j?.installs ?? []), ...(j?.serviceVisits ?? [])]

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <PageHeader title="Today" sub={fmtDate(todayStr())} />
      {loading ? <Loading rows={3} /> : all.length === 0 ? (
        <EmptyState icon={<Sun className="h-5 w-5" />} title="No jobs today" hint="Check tomorrow's schedule or open Scan to look up a unit." />
      ) : (
        <>
          {(j?.surveys ?? []).map((s: any) => (
            <JobCard key={s.id} title={s.title} address={s.address} status={s.status} meta={`Survey · ${s.ref}`} onClick={() => nav(`survey/${s.id}`)} icon={<ClipboardCheck className="h-4 w-4" />} />
          ))}
          {(j?.installs ?? []).map((i: any) => (
            <JobCard key={i.id} title={i.title} address={i.address} status={i.status} meta={`Install · ${i.ref}${i.crew?.length ? ` · crew: ${i.crew.join(', ')}` : ''}`} onClick={() => nav(`job/${i.id}`)} icon={<Sun className="h-4 w-4" />} highlight />
          ))}
          {(j?.serviceVisits ?? []).map((t: any) => (
            <JobCard key={t.id} title={t.title} address={t.address} status={t.status} meta={`Service · ${t.ref}`} onClick={() => nav(`ticket/${t.id}`)} icon={<PenLine className="h-4 w-4" />} />
          ))}
        </>
      )}
    </div>
  )
}

function JobCard({ title, address, status, meta, onClick, icon, highlight }: any) {
  return (
    <button onClick={onClick} className={cn('w-full text-left rounded-xl border-2 bg-white p-4 transition active:scale-[0.99]', highlight ? 'border-blue-200 hover:border-blue-400' : 'border-slate-200 hover:border-slate-300')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', highlight ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500')}>{icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{address}</span></div>
            <div className="text-[11px] text-slate-400 mt-0.5">{meta}</div>
          </div>
        </div>
        <StageChip status={status} />
      </div>
    </button>
  )
}

// ── S5: survey form ───────────────────────────────────────────────

export function SurveyFormView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/surveys/${id}`), [id])
    const { busy, mutate } = useMutation()
    const draftKey = `sp.draft.survey.${id}`

    // FR-6.7: the draft is read once per mount and merged into the shown
    // values during render (restoration needs no state sync).
    const [draft] = useState(() => loadDraft<Record<string, unknown>>(draftKey))
    const [form, setForm] = useState<any>(null) // user edits only; null = follow restored/server values
    const [draftDismissed, setDraftDismissed] = useState(false)
    const draftLockRef = useRef(false)

    // FR-6.7: debounce-save the draft (~500 ms) on every user edit
    useEffect(() => {
      if (!form) return
      const t = setTimeout(() => {
        if (!draftLockRef.current) saveDraftNow(draftKey, form)
      }, 500)
      return () => clearTimeout(t)
    }, [form, draftKey])

    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Survey not found">{error}</Alert>

    const s = data.survey
    const photos = data.photos
    const base = {
      roofType: s.roofType ?? 'RCC', azimuthDeg: s.azimuthDeg ?? 180, tiltDeg: s.tiltDeg ?? 15,
      usableAreaSqm: s.usableAreaSqm ?? s.lead?.roofAreaSqm ?? 30, shading: s.shading ?? 'NONE',
      cableDistanceM: s.cableDistanceM ?? 20, structureHeightM: s.structureHeightM ?? 2,
    }
    const editable = s.status === 'SCHEDULED' || s.status === 'COMPLETED'
    const draftActive = editable && !!draft && !draftDismissed
    const f = form ?? (draftActive ? { ...base, ...draft } : base)
    const set = (k: string, v: unknown) => {
      draftLockRef.current = false
      setForm({ ...f, [k]: v })
    }
    const clearLocalDraft = () => {
      draftLockRef.current = true
      clearDraft(draftKey)
      setDraftDismissed(true)
    }

    return (
      <div className="max-w-xl mx-auto space-y-4">
        <PageHeader
          back={{ label: 'Today', to: 'today' }}
          title={`Site survey — ${s.lead.customer.name}`}
          sub={`${s.lead.leadNumber} · ${s.lead.customer.addressLine}, ${s.lead.customer.city}`}
          actions={<>
            <MapLinkButton href={mapsHref(s.lead.customer)} />
            <StageChip status={s.status} />
          </>}
        />

        {editable && (
          <Card>
            <CardContent className="p-4 space-y-4">
              {draftActive && <DraftNote onDismiss={() => setDraftDismissed(true)} />}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Roof type</Label>
                  <select className="w-full rounded-md border border-slate-200 px-2.5 py-2.5 text-base" value={f.roofType} onChange={(e) => set('roofType', e.target.value)}>
                    <option value="RCC">RCC</option><option value="METAL">Metal sheet</option><option value="TILE">Tiled</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>Shading</Label>
                  <select className="w-full rounded-md border border-slate-200 px-2.5 py-2.5 text-base" value={f.shading} onChange={(e) => set('shading', e.target.value)}>
                    <option value="NONE">None</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">Heavy</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>Roof direction (azimuth °)</Label><Input type="number" className="h-11" value={f.azimuthDeg} onChange={(e) => set('azimuthDeg', Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Tilt (°)</Label><Input type="number" className="h-11" value={f.tiltDeg} onChange={(e) => set('tiltDeg', Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Usable area (m²)</Label><Input type="number" className="h-11" value={f.usableAreaSqm} onChange={(e) => set('usableAreaSqm', Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Cable distance (m)</Label><Input type="number" className="h-11" value={f.cableDistanceM} onChange={(e) => set('cableDistanceM', Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Structure height (m)</Label><Input type="number" className="h-11" value={f.structureHeightM} onChange={(e) => set('structureHeightM', Number(e.target.value))} /></div>
              </div>

              <div>
                <Label className="mb-1.5 block">Roof photos (at least one)</Label>
                <RetryPhotoUploader ownerType="SURVEY" ownerId={id} kind="SURVEY" label="Roof photo" photos={photos} onUploaded={reload} />
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 h-12" disabled={busy} onClick={() => mutate(() => api(`/surveys/${id}/save`, { method: 'POST', json: f }), { success: 'Draft saved', onDone: clearLocalDraft })}>Save draft</Button>
                <Button className="flex-1 h-12" disabled={busy || photos.length === 0} onClick={() => mutate(() => api(`/surveys/${id}/save`, { method: 'POST', json: f }).then(() => api(`/surveys/${id}/complete`, { method: 'POST' })), { success: 'Survey submitted for approval', onDone: () => { clearLocalDraft(); reload() } })}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Submit survey
                </Button>
              </div>
              {photos.length === 0 && <p className="text-xs text-amber-700">At least one roof photo is required before submitting (PHOTOS_REQUIRED).</p>}
            </CardContent>
          </Card>
        )}

        {s.status === 'APPROVED' && <Alert tone="success" title="Survey approved">A quotation can now be sent to the customer.</Alert>}
        {s.status === 'REJECTED' && <Alert tone="warn" title={`Survey rejected: ${s.rejectionReason}`}>Book a re-survey from the lead page.</Alert>}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Field label="Name">{s.lead.customer.name}</Field>
            <Field label="Phone">{s.lead.customer.phone}</Field>
            <Field label="Requested">{s.lead.requestedCapacityKw ? `${s.lead.requestedCapacityKw} kW ${s.lead.systemTypePref === 'OFF_GRID' ? 'Off-Grid' : 'On-Grid'}` : 'not specified'}</Field>
          </CardContent>
        </Card>
      </div>
    )
  }
}

// ── S15: installation job stepper ─────────────────────────────────

interface ChecklistState {
  standsMounted: boolean
  panelsLaid: boolean
  wiringBoxes: boolean
  earthingDone: boolean
  powerTest: boolean
}

const EMPTY_CHECKLIST: ChecklistState = {
  standsMounted: false, panelsLaid: false, wiringBoxes: false, earthingDone: false, powerTest: false,
}

const CHECKLIST_ITEMS: { key: keyof ChecklistState; label: string; hint: string }[] = [
  { key: 'standsMounted', label: 'Stands mounted', hint: 'Structure level and anchored' },
  { key: 'panelsLaid', label: 'Panels laid', hint: 'All panels fixed to structure' },
  { key: 'wiringBoxes', label: 'Wiring done (boxes connected)', hint: 'DC/AC boxes terminated' },
  { key: 'earthingDone', label: 'Earthing done', hint: 'Earth pits and LA connected' },
  { key: 'powerTest', label: 'Power test (generation tested)', hint: 'Inverter generating and syncing' },
]

interface JobDraft {
  checklist?: Partial<ChecklistState>
  capacity?: unknown
  testReading?: unknown
  notes?: string
}

export function JobStepperView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/installations/${id}`), [id])
    const { busy, mutate } = useMutation()
    const draftKey = `sp.draft.signoff.${id}`

    // FR-6.7: the draft is read once per mount and merged into the shown
    // values during render. Local edit states below hold ONLY user changes
    // (null = follow the restored draft, else the server copy).
    const [draft] = useState(() => loadDraft<JobDraft>(draftKey))
    const [clOverride, setClOverride] = useState<ChecklistState | null>(null)
    const [capText, setCapText] = useState<string | null>(draft?.capacity != null && draft.capacity !== '' ? String(draft.capacity) : null)
    const [readingText, setReadingText] = useState<string | null>(draft?.testReading != null && draft.testReading !== '' ? String(draft.testReading) : null)
    const [notes, setNotes] = useState(draft?.notes ?? '')
    const [draftDismissed, setDraftDismissed] = useState(false)
    const [startLocNote, setStartLocNote] = useState(false)
    const draftLockRef = useRef(false)

    const inst0 = data?.installation
    const serverChecklist: ChecklistState = { ...EMPTY_CHECKLIST, ...(inst0?.checklist ? JSON.parse(inst0.checklist) : {}) }
    const jobActive = !!inst0 && ['SCHEDULED', 'IN_PROGRESS', 'AWAITING_SIGNOFF'].includes(inst0.status)
    const draftActive = jobActive && !!draft && !draftDismissed

    // effective values: user edit → restored draft → server copy
    const checklist: ChecklistState = clOverride ?? (draftActive ? { ...serverChecklist, ...(draft?.checklist ?? {}) } : serverChecklist)
    const capShown = capText ?? (draftActive && draft?.capacity != null && draft.capacity !== '' ? String(draft.capacity) : inst0?.installedCapacityKw != null ? String(inst0.installedCapacityKw) : '')
    const readingShown = readingText ?? (draftActive && draft?.testReading != null && draft.testReading !== '' ? String(draft.testReading) : inst0?.testReadingW != null ? String(inst0.testReadingW) : '')
    const capacity = capShown !== '' && Number.isFinite(Number(capShown)) ? Number(capShown) : null
    const reading = readingShown !== '' && Number.isFinite(Number(readingShown)) ? Number(readingShown) : null
    const localTouched = clOverride != null || capText != null || readingText != null || notes !== (draft?.notes ?? '')
    const serverTouched = clOverride != null || capText != null || readingText != null

    // FR-6.7: debounce-save the draft (~500 ms) whenever local state changes
    useEffect(() => {
      if (!jobActive || !localTouched) return
      const t = setTimeout(() => {
        if (!draftLockRef.current) saveDraftNow(draftKey, { checklist, capacity: capShown, testReading: readingShown, notes })
      }, 500)
      return () => clearTimeout(t)
    }, [checklist, capShown, readingShown, notes, localTouched, jobActive, draftKey])

    // background server sync (debounced) — replaces the old per-keystroke reload
    useEffect(() => {
      if (!jobActive || !serverTouched) return
      const t = setTimeout(() => {
        void mutate(() => api(`/installations/${id}/update`, {
          method: 'POST',
          json: {
            checklist,
            ...(capacity != null ? { installedCapacityKw: capacity } : {}),
            ...(reading != null ? { testReadingW: reading } : {}),
          },
        }), { silent: true, onDone: () => {} })
      }, 600)
      return () => clearTimeout(t)
    }, [checklist, capacity, reading, serverTouched, jobActive, id])

    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Job not found">{error}</Alert>

    const inst = data.installation
    const order = inst.order
    const photos = data.photos ?? []
    const beforePhotos = data.beforePhotos ?? []
    const photoKinds = new Set(photos.map((p: any) => p.kind))
    const steps = ['Start', 'Checklist', 'Size and test', 'Photos', 'Sign-off']
    const currentStep = inst.status === 'COMPLETED' ? 5
      : inst.status === 'AWAITING_SIGNOFF' ? 4
      : inst.status === 'IN_PROGRESS' ? (Object.values(checklist).every(Boolean) && capacity && reading && ['ARRAY', 'INVERTER', 'EARTHING'].every((k) => photoKinds.has(k)) ? 4 : 1)
      : 0

    const toggle = (key: keyof ChecklistState) => {
      draftLockRef.current = false
      setClOverride({ ...checklist, [key]: !checklist[key] })
    }

    const clearJobDraft = () => {
      draftLockRef.current = true
      clearDraft(draftKey)
      setDraftDismissed(true)
      setClOverride(null)
      setCapText(null)
      setReadingText(null)
      setNotes('')
    }

    return (
      <div className="max-w-xl mx-auto space-y-4">
        <PageHeader
          back={{ label: 'Today', to: 'today' }}
          title={`${order.capacityKw} kW ${order.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} — ${order.customer.name}`}
          sub={`${order.orderNumber} · ${order.customer.addressLine}, ${order.customer.city}`}
          actions={<StageChip status={inst.status} />}
        />

        {/* progress */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Step {Math.min(currentStep + 1, 5)} of 5</span><span>{steps[Math.min(currentStep, 4)]}</span></div>
          <Progress value={(Math.min(currentStep, 4) / 4) * 100} />
        </div>

        {/* FR-6.1: site address with Google Maps link + crew */}
        <Card>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <div className="flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                <div className="min-w-0">{order.customer.addressLine}, {order.customer.city} {order.customer.pincode}</div>
              </div>
              <div className="text-xs text-slate-500 mt-1.5">
                Crew: {inst.crew.length > 0
                  ? inst.crew.map((c: any) => `${c.technician.user.name}${c.role === 'LEAD' ? ' (lead)' : ''}`).join(', ')
                  : 'not assigned yet'}
              </div>
            </div>
            <MapLinkButton href={mapsHref(order.customer)} />
          </CardContent>
        </Card>

        {draftActive && <DraftNote onDismiss={() => setDraftDismissed(true)} />}

        {/* FR-6.1: kit list from the order lines (product, qty, serialized flag) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Package className="h-4 w-4" /> Kit list ({order.lines.length} lines)</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto divide-y">
              {order.lines.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.description || l.product.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>{l.product.sku}</span>
                      {l.product.isSerialized && (
                        <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1 py-px text-[10px] text-slate-600"><ScanLine className="h-2.5 w-2.5" />serialized</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm tabular-nums font-medium">{num(l.qty)} <span className="text-xs font-normal text-slate-400">{l.product.uom}</span></div>
                    {l.qtyDispatched > 0 && <div className="text-[11px] text-green-700">{num(l.qtyDispatched)} dispatched</div>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Serialized units are scanned at dispatch and linked to the warranty at sign-off.</p>
          </CardContent>
        </Card>

        {/* step 0: start */}
        {inst.status === 'SCHEDULED' && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-sm font-semibold">Start the job</div>
              <p className="text-sm text-slate-500">Starting records the time and your location. Time logs feed each technician&apos;s pay summary automatically.</p>
              <Button className="w-full h-12 text-base" disabled={busy} onClick={() => mutate(async () => {
                // FR-6.2: real GPS coords with graceful fallback — never blocks the start
                const loc = await getCurrentCoords()
                if (loc.fallback) setStartLocNote(true)
                return api(`/installations/${id}/start`, { method: 'POST', json: { lat: loc.lat, lng: loc.lng } })
              }, { success: 'Job started', onDone: reload })}>
                <PlayCircle className="h-5 w-5 mr-2" /> Start job
              </Button>
              {startLocNote && (
                <p className="text-xs text-amber-700 flex items-center gap-1"><MapPin className="h-3 w-3" /> Location unavailable — using site address</p>
              )}
              <Button variant="outline" className="w-full h-11" onClick={() => {
                const reason = window.prompt('Hold reason (rain, customer absent, site not ready):')
                if (reason) void mutate(() => api(`/installations/${id}/hold`, { method: 'POST', json: { reason, newDate: null } }), { success: 'Job put on hold', onDone: reload })
              }}><PauseCircle className="h-4 w-4 mr-1.5" /> Put on hold</Button>
            </CardContent>
          </Card>
        )}

        {/* steps 1-3: checklist, size/test, photos */}
        {['IN_PROGRESS', 'AWAITING_SIGNOFF'].includes(inst.status) && (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><ClipboardCheck className="h-4 w-4" /> Checklist ({Object.values(checklist).filter(Boolean).length} of 5)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {CHECKLIST_ITEMS.map((item) => (
                  <button key={item.key} onClick={() => toggle(item.key)}
                    className={cn('w-full flex items-center justify-between rounded-lg border-2 p-3 text-left transition', checklist[item.key] ? 'border-green-400 bg-green-50' : 'border-slate-200 active:border-slate-300')}>
                    <div>
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-slate-400">{item.hint}</div>
                    </div>
                    <span className={cn('grid h-6 w-6 place-items-center rounded-full border-2', checklist[item.key] ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300')}>
                      {checklist[item.key] && <CheckCircle2 className="h-4 w-4" />}
                    </span>
                  </button>
                ))}
                <p className="text-[11px] text-slate-400">Ticks save automatically — and are kept on this device if the network drops.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">System size and generation test</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Installed capacity (kWp)</Label>
                  <Input type="number" step="0.01" className="h-11" value={capShown} onChange={(e) => { draftLockRef.current = false; setCapText(e.target.value) }} placeholder="3.24" />
                </div>
                <div className="space-y-1">
                  <Label>Test reading (W)</Label>
                  <Input type="number" className="h-11" value={readingShown} onChange={(e) => { draftLockRef.current = false; setReadingText(e.target.value) }} placeholder="2600" />
                </div>
                <p className="col-span-2 text-xs text-slate-400">6 panels × 540 Wp = 3.24 kWp is the capacity recorded at sign-off.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Camera className="h-4 w-4" /> Photos — array, inverter, earthing required</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3">
                  {(['ARRAY', 'INVERTER', 'EARTHING'] as const).map((kind, idx) => (
                    <div key={kind}>
                      <div className="flex items-center justify-between mb-1">
                        <Label>{kind === 'ARRAY' ? 'Panel array' : kind === 'INVERTER' ? 'Inverter' : 'Earthing'}</Label>
                        {photoKinds.has(kind) && <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> taken</span>}
                      </div>
                      {photoKinds.has(kind)
                        ? <div className="grid grid-cols-3 gap-2">{photos.filter((p: any) => p.kind === kind).map((p: any) => <img key={p.id} src={p.url} alt={kind} className="rounded-lg border aspect-[4/3] object-cover" />)}</div>
                        : <RetryPhotoUploader ownerType="INSTALLATION" ownerId={id} kind={kind} label={kind} photos={[]} onUploaded={reload} sampleSeed={idx} />}
                    </div>
                  ))}
                </div>
                {beforePhotos.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Before (survey photos)</div>
                    <div className="grid grid-cols-3 gap-2">{beforePhotos.map((p: any) => <img key={p.id} src={p.url} alt="survey" className="rounded-lg border aspect-[4/3] object-cover" />)}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Alert tone="info" title="Sign-off unlocks when the checklist is complete, size and reading are entered, and all three photos are attached." />
          </>
        )}

        {/* step 4: sign-off */}
        {currentStep === 4 && inst.status !== 'COMPLETED' && (
          <SignoffPanel
            installationId={id}
            inst={inst}
            photos={photos}
            checklist={checklist}
            capacity={capacity}
            reading={reading}
            notes={notes}
            onNotesChange={setNotes}
            onSigned={() => { clearJobDraft(); reload() }}
          />
        )}

        {/* completed */}
        {inst.status === 'COMPLETED' && (
          <Card className="border-green-300 bg-green-50/40">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-800"><CheckCircle2 className="h-5 w-5" /> Installation complete</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Installed capacity">{inst.installedCapacityKw} kWp</Field>
                <Field label="Test reading">{num(inst.testReadingW)} W</Field>
                <Field label="Started">{fmtDateTime(inst.startedAt)}</Field>
                <Field label="Finished">{fmtDateTime(inst.finishedAt)}</Field>
                <Field label="Signed by">{inst.signedName}</Field>
                <Field label="Crew">{inst.crew.map((c: any) => c.technician.user.name).join(', ')}</Field>
              </div>
              <div className="text-xs text-slate-400 break-all">Proof hash {inst.signoffHash?.slice(0, 32)}…</div>
            </CardContent>
          </Card>
        )}

        {inst.status === 'ON_HOLD' && (
          <Alert tone="warn" title={`On hold: ${inst.holdReason}`}>A new date can be set from the schedule screen; the undeparted dispatch stays in the warehouse.</Alert>
        )}
      </div>
    )
  }
}

function SignoffPanel({ installationId, inst, photos, checklist, capacity, reading, notes, onNotesChange, onSigned }: {
  installationId: string
  inst: any
  photos: any[]
  checklist: ChecklistState
  capacity: number | null
  reading: number | null
  notes: string
  onNotesChange: (v: string) => void
  onSigned: () => void
}) {
  const [name, setName] = useState(inst.order.customer.name)
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [certificateToken, setCertificateToken] = useState<string | null>(null)
  const [finishLocNote, setFinishLocNote] = useState(false)

  const serials = inst.order.dispatches?.flatMap((d: any) => d.lines.flatMap((l: any) => l.units.map((u: any) => u.unit.serialNumber))) ?? []

  const signoff = async () => {
    setBusy(true)
    try {
      let attachmentId: string | null = null
      if (signature) {
        const file = await dataUrlToFile(signature, 'signature.png')
        // FR-6.7: retrying upload; if all attempts fail, continue without the image
        const res = await uploadPhotoWithRetry(file, 'INSTALLATION', installationId, 'SIGNATURE')
        if (res.ok) attachmentId = res.data.attachmentId
        else toast.error('Signature upload failed after 4 attempts — continuing without it.')
      }
      // FR-6.2: capture the finish location the same way as the start (never blocks)
      const loc = await getCurrentCoords()
      if (loc.fallback) setFinishLocNote(true)
      const result = await api(`/installations/${installationId}/signoff`, {
        method: 'POST',
        json: {
          signedName: name,
          signatureAttachmentId: attachmentId,
          checklist,
          notes: notes.trim() || undefined,
          ...(capacity != null ? { installedCapacityKw: capacity } : {}),
          ...(reading != null ? { testReadingW: reading } : {}),
          finishLat: loc.lat,
          finishLng: loc.lng,
        },
      })
      setCertificateToken(result.certificateToken)
      toast.success('Signed off — certificate issued and profit computed')
      onSigned()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (certificateToken) {
    return (
      <Card className="border-green-300">
        <CardContent className="p-4 space-y-3 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
          <div className="font-semibold">Certificate ready</div>
          <p className="text-sm text-slate-500">Share this link with the customer — it also appears in their My SunPower portal.</p>
          <Button onClick={() => (window.location.hash = `/c/${certificateToken}`)}>Open certificate</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="pb-2"><CardTitle className="text-base">Customer sign-off</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-slate-50 border p-3 text-sm space-y-1">
          <div className="font-semibold">{inst.installedCapacityKw ?? capacity ?? '—'} kWp {inst.order.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} system</div>
          <div className="text-slate-500">{fmtDate(toDateStr(inst.startedAt) || todayStr())} · {serials.length} serialized units</div>
          <div className="flex flex-wrap gap-1 mt-1">{serials.map((s: string) => <span key={s} className="font-mono text-[10px] bg-white border rounded px-1 py-0.5">{s}</span>)}</div>
          <button className="text-xs text-blue-700 underline" onClick={() => (window.location.hash = `/orders/${inst.orderId}`)}>View full parts list</button>
        </div>
        <div className="space-y-1">
          <Label>Customer name</Label>
          <Input className="h-11 text-base" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Notes (optional)</Label>
          <Textarea className="min-h-20 text-sm" value={notes} maxLength={2000} onChange={(e) => onNotesChange(e.target.value)} placeholder="Anything notable about the install (shading, customer remarks)…" />
          <p className="text-[11px] text-slate-400">Notes are kept with the sign-off audit record; drafted notes survive app close on this device.</p>
        </div>
        <div>
          <Label className="mb-1.5 block">Signature</Label>
          <SignaturePad onChange={setSignature} />
        </div>
        {finishLocNote && (
          <p className="text-xs text-amber-700 flex items-center gap-1"><MapPin className="h-3 w-3" /> Location unavailable — using site address</p>
        )}
        <p className="text-xs text-slate-500">Line for the customer: <em>I confirm the system was installed and tested as listed above.</em></p>
        <Button className="w-full h-12 text-base" disabled={busy || name.trim().length < 2} onClick={signoff}>
          <PenLine className="h-4 w-4 mr-2" /> Sign and accept
        </Button>
      </CardContent>
    </Card>
  )
}

// ── scan helper for staff ─────────────────────────────────────────

export function ScanView() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const { busy, mutate } = useMutation()

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <PageHeader title="Scan a unit" sub="Staff scan opens the full unit record; the QR on the label opens the public warranty page for anyone." />
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="QR code or serial number" className="font-mono h-11" />
            <Button className="h-11" disabled={busy || !code} onClick={() => mutate(async () => {
              const r = await api(`/inventory/units?code=${encodeURIComponent(code.trim())}`)
              setResult(r.unit)
              return r
            }, { silent: true, onDone: () => {} })}><ScanLine className="h-4 w-4 mr-1" /> Look up</Button>
          </div>
          {result === null && <p className="text-xs text-slate-400">Try <code className="bg-slate-100 rounded px-1">INV3K-24A-001873</code> (the May 2025 demo inverter).</p>}
          {result && (
            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="font-semibold">{result.product.name}</div>
              <div className="font-mono text-xs text-slate-500">{result.serialNumber} · QR {result.qrCode}</div>
              <div className="flex gap-2 flex-wrap text-xs">
                <StageChip status={result.status} />
                {result.customer && <span className="self-center text-slate-500">{result.customer.name}</span>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => (window.location.hash = `/w/${result.qrCode}`)}><QrCode className="h-3.5 w-3.5 mr-1" /> Public warranty page</Button>
                {result.customer && <Button size="sm" variant="outline" onClick={() => (window.location.hash = `/customer/${result.customerId}`)}>Customer record</Button>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
