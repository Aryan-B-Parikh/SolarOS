// Shared UI vocabulary (spec 3.3 shared components): StageChip, NextStepPanel,
// Timeline, MoneyText (lakh format), SerialBadge, WarrantyBar with a today
// marker and days left, KpiTile, SignaturePad, PhotoGrid, EmptyState, Loading.

'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { money, fmtDate, fmtDateTime, daysUntil, Tone } from './lib'
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, Clock, Info, Sun, X } from 'lucide-react'

const TONE_CLASS: Record<Tone, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  done: 'bg-green-50 text-green-700 border-green-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
}

export function StageChip({ status, label, tone, className }: { status?: string; label?: string; tone?: Tone; className?: string }) {
  const t = tone ?? (status ? require0(status) : 'neutral')
  return (
    <Badge variant="outline" className={cn('font-medium border', TONE_CLASS[t], className)}>
      {label ?? status?.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  )
}

function require0(s: string): Tone {
  // import-free statusTone to avoid circular imports
  if (['NEW', 'OPEN', 'PENDING_ADVANCE', 'DRAFT'].includes(s)) return 'new'
  if (['CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'CONFIRMED', 'ASSIGNED', 'PICKING', 'READY', 'SCHEDULED', 'PREPARING', 'SUBMITTED'].includes(s)) return 'progress'
  if (['WON', 'SURVEY_APPROVED', 'ACCEPTED', 'COMPLETED', 'CLOSED', 'APPROVED', 'INSTALLED', 'DELIVERED', 'RECEIVED', 'DISBURSED', 'PAID', 'IN_STOCK'].includes(s)) return 'done'
  if (['QUOTED', 'SENT', 'IN_PROGRESS', 'IN_TRANSIT', 'AWAITING_SIGNOFF', 'PARTIAL'].includes(s)) return 'info'
  if (['ON_HOLD', 'RMA', 'DEAD', 'FAILED', 'OVERDUE'].includes(s)) return 'warn'
  if (['OUT_OF_WARRANTY', 'EXCLUDED', 'UNKNOWN_UNIT', 'CHARGEABLE'].includes(s)) return 'warn'
  return 'neutral'
}

export function Money({ paise, className, signed }: { paise: number | null | undefined; className?: string; signed?: boolean }) {
  const neg = (paise ?? 0) < 0
  return <span className={cn('tabular-nums', signed && neg && 'text-red-600', className)}>{money(paise)}</span>
}

export function KpiTile({ title, value, sub, tone }: { title: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  return (
    <Card className={cn('py-4 gap-1', tone === 'danger' && 'border-red-200 bg-red-50/50', tone === 'success' && 'border-green-200 bg-green-50/40')}>
      <CardContent className="px-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</div>
        <div className={cn('text-xl font-semibold tabular-nums mt-1', tone === 'danger' && 'text-red-700', tone === 'success' && 'text-green-700')}>{value}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export function NextStepPanel({ title, hint, children, action }: { title: string; hint?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-blue-600 bg-blue-50/60 p-4 flex items-start gap-3">
      <div className="mt-0.5 shrink-0 grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white">
        <ArrowRight className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-blue-900">{title}</div>
        {hint && <div className="text-sm text-blue-900/80 mt-0.5">{hint}</div>}
        {children && <div className="text-sm text-blue-900/80 mt-0.5">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Timeline({ items }: { items: { at: string | Date; title: string; body?: string; tone?: Tone }[] }) {
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-4">
      {items.map((it, i) => (
        <li key={i} className="ml-4">
          <span className={cn('absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white', it.tone === 'done' ? 'bg-green-500' : it.tone === 'warn' ? 'bg-amber-500' : it.tone === 'danger' ? 'bg-red-500' : 'bg-slate-300')} />
          <div className="text-sm font-medium">{it.title}</div>
          {it.body && <div className="text-sm text-slate-500">{it.body}</div>}
          <div className="text-xs text-slate-400 mt-0.5">{fmtDateTime(it.at)}</div>
        </li>
      ))}
    </ol>
  )
}

export function SerialBadge({ serial, onClick }: { serial: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-200 transition">
      <Sun className="h-3 w-3 text-amber-500" />
      {serial}
    </button>
  )
}

export function WarrantyBar({ start, end, daysLeft, compact }: { start: string; end: string; daysLeft: number; compact?: boolean }) {
  const total = Math.max(1, new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime())
  const elapsed = Math.min(Math.max(0, Date.now() - new Date(start + 'T00:00:00Z').getTime()), total)
  const pctElapsed = Math.round((elapsed / total) * 100)
  const active = daysLeft >= 0
  return (
    <div className={cn('w-full', compact ? 'min-w-24' : 'min-w-40')}>
      <div className="relative h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className={cn('h-full rounded-full', active ? 'bg-green-500' : 'bg-slate-400')} style={{ width: `${pctElapsed}%` }} />
        <div className="absolute top-[-2px] h-3 w-0.5 bg-blue-700" style={{ left: `calc(${pctElapsed}% - 1px)` }} title="today" />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 mt-1">
        <span>{fmtDate(start)}</span>
        <span className={cn('font-medium', active ? 'text-green-700' : 'text-slate-500')}>
          {active ? `${daysLeft} days left` : `ended ${fmtDate(end)}`}
        </span>
        <span>{fmtDate(end)}</span>
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
      <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">{icon ?? <Info className="h-5 w-5" />}</div>
      <div className="text-sm font-medium text-slate-700">{title}</div>
      {hint && <div className="text-sm text-slate-500 mt-0.5">{hint}</div>}
    </div>
  )
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  )
}

export function PageHeader({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { label: string; to: string } }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        {back && (
          <button onClick={() => (window.location.hash = back.to)} className="text-xs text-slate-500 hover:text-slate-800 mb-1 inline-flex items-center gap-1">
            ← {back.label}
          </button>
        )}
        <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
        {sub && <div className="text-sm text-slate-500 mt-0.5">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

// ── Signature pad (S16): smooth capture on touch screens ──────────

export function SignaturePad({ onChange, label }: { onChange: (dataUrl: string | null) => void; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * canvasRef.current!.width, y: ((e.clientY - rect.top) / rect.height) * canvasRef.current!.height }
  }

  return (
    <div>
      <div className="relative rounded-lg border-2 border-slate-300 bg-white touch-none" style={{ height: 160 }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={320}
          className="w-full h-full touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            last.current = pos(e)
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return
            const ctx = canvasRef.current!.getContext('2d')!
            const p = pos(e)
            ctx.beginPath()
            ctx.moveTo(last.current.x, last.current.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            last.current = p
            if (!hasInk) setHasInk(true)
          }}
          onPointerUp={() => {
            drawing.current = false
            last.current = null
            if (hasInk) onChange(canvasRef.current!.toDataURL('image/png'))
          }}
        />
        {!hasInk && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">{label ?? 'Sign here with a finger or stylus'}</div>}
      </div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-slate-500">Cannot sign? The crew lead can type the name instead and attest.</span>
        <Button type="button" variant="outline" size="sm" disabled={!hasInk} onClick={() => {
          const ctx = canvasRef.current!.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height)
          setHasInk(false)
          onChange(null)
        }}><X className="h-3.5 w-3.5 mr-1" />Clear</Button>
      </div>
    </div>
  )
}

// ── Photo grid + uploader with sample-photo generation ────────────

export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type })
}

/** generate a labelled sample roof/equipment photo (canvas) so the demo works without a camera */
export async function makeSamplePhoto(label: string, seed = 0): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 800, 600)
  const hues = ['#93c5fd', '#fcd34d', '#86efac', '#fca5a5', '#c4b5fd']
  grad.addColorStop(0, hues[seed % hues.length])
  grad.addColorStop(1, '#e2e8f0')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 800, 600)
  // roof-ish panels
  ctx.fillStyle = 'rgba(15,23,42,0.16)'
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    ctx.save()
    ctx.translate(120 + c * 150, 160 + r * 130)
    ctx.transform(1, 0.18, 0, 1, 0, 0)
    ctx.fillRect(0, 0, 120, 90)
    ctx.restore()
  }
  ctx.fillStyle = 'rgba(15,23,42,0.75)'
  ctx.fillRect(0, 520, 800, 80)
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 30px Inter, sans-serif'
  ctx.fillText(`Sample photo — ${label}`, 24, 568)
  ctx.font = '400 20px Inter, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), 24, 596 - 0)
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85))
  return new File([blob], `sample-${label.toLowerCase().replace(/\s+/g, '-')}.jpg`, { type: 'image/jpeg' })
}

export async function uploadPhoto(file: File, ownerType: string, ownerId: string, kind: string): Promise<{ attachmentId: string; url: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('ownerType', ownerType)
  form.append('ownerId', ownerId)
  form.append('kind', kind)
  const res = await fetch('/api/v1/uploads', { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? 'Upload failed')
  return data
}

export function PhotoThumb({ url, label, onRemove }: { url: string; label: string; onRemove?: () => void }) {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 w-full aspect-[4/3]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-full object-cover" />
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] font-medium text-white">{label}</div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 opacity-0 group-hover:opacity-100 transition" aria-label="Remove photo">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function PhotoUploader({ ownerType, ownerId, kind, label, photos, onUploaded, sampleSeed = 0 }: {
  ownerType: string; ownerId: string; kind: string; label: string
  photos: { id: string; url: string; kind: string }[]
  onUploaded: () => void; sampleSeed?: number
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  const doUpload = async (file: File) => {
    setBusy(true)
    try {
      await uploadPhoto(file, ownerType, ownerId, kind)
      onUploaded()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((p) => <PhotoThumb key={p.id} url={p.url} label={p.kind} />)}
        {photos.length === 0 && (
          <button type="button" disabled={busy} onClick={async () => doUpload(await makeSamplePhoto(label, sampleSeed))}
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
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={async () => doUpload(await makeSamplePhoto(label, sampleSeed))}>
            Use sample photo
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void doUpload(f)
          e.target.value = ''
        }} />
      </div>
    </div>
  )
}

// simple labelled field for detail panels
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm mt-0.5">{children}</div>
    </div>
  )
}

export function Alert({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'danger' | 'success' | 'neutral'; title?: string; children?: ReactNode; icon?: ReactNode }) {
  const cls = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-green-200 bg-green-50 text-green-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]
  const Icon = icon ?? (tone === 'warn' ? <AlertTriangle className="h-4 w-4" /> : tone === 'danger' ? <AlertTriangle className="h-4 w-4" /> : tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />)
  return (
    <div className={cn('rounded-lg border p-3 flex gap-2.5 text-sm', cls)}>
      <span className="mt-0.5 shrink-0">{Icon}</span>
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function SlaBadge({ dueAt, stopped }: { dueAt: string | Date; stopped?: boolean }) {
  const overdue = !stopped && new Date(dueAt).getTime() < Date.now()
  const minsLeft = Math.round((new Date(dueAt).getTime() - Date.now()) / 60000)
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 border',
      overdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200')}>
      <Clock className="h-3 w-3" />
      {stopped ? 'contacted' : overdue ? `SLA missed ${Math.abs(minsLeft)}m` : minsLeft < 90 ? `${minsLeft}m left` : `${Math.round(minsLeft / 60)}h left`}
    </span>
  )
}

export { Progress }
