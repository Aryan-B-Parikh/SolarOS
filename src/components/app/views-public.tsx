// Public pages (S1, S8, S22, S23, S24): two-step enquiry form, customer quote
// view with accept/reject, the My SunPower portal with an eight-stage tracker,
// the completion certificate, and the public warranty page by QR code.

'use client'

import { useEffect, useState } from 'react'
import { api, money, fmtDate, num, relTime, useData, CUSTOMER_STAGES, VERDICT_COPY, daysUntil } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, Alert as AlertBox, EmptyState, Loading, WarrantyBar, PhotoThumb, Field } from './shared'
import { PrintOverlay, QuoteDoc, InvoiceDoc, WarrantyDoc } from './docs'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Sun, ShieldCheck, Wrench, Printer, Camera, FileText, Wallet, Clock, ArrowRight, Lock, RefreshCw, Phone, ArrowLeft, CreditCard, Loader2 } from 'lucide-react'

// ── S1: enquiry form (public) ─────────────────────────────────────

const ENQUIRY_STEP1_FIELDS = ['name', 'phone', 'addressLine', 'city', 'pincode']

/** What /api/v1/ai/bill-scan returns for a readable bill. */
interface BillScanResult {
  monthlyUnits: number | null
  billAmount: number | null
  tariff: string | null
  consumerName: string | null
  billingDays: number | null
  suggestedKw: number | null
  extractError?: string
  raw?: string
}

export function EnquiryView() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<{
    name: string; phone: string; addressLine: string; city: string; pincode: string
    requestedCapacityKw: number | null; systemTypePref: string; wantsSubsidy: boolean
    monthlyBillRupees: number; consent: boolean; honeypot: string
  }>({
    name: '', phone: '', addressLine: '', city: 'Ahmedabad', pincode: '',
    requestedCapacityKw: 3, systemTypePref: 'ON_GRID', wantsSubsidy: true, monthlyBillRupees: 3000,
    consent: false, honeypot: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ reference: string; portalToken: string | null; message: string } | null>(null)
  // AI bill scan (T4) — optional; the form submits exactly as before without it
  const [billScan, setBillScan] = useState<BillScanResult | null>(null)
  const set = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n })
  }

  const validate = (s: 0 | 1): Record<string, string> => {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (form.name.trim().length < 2) e.name = 'Please enter your full name.'
      if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10-digit mobile number.'
      if (form.addressLine.trim().length < 5) e.addressLine = 'Please enter the installation address.'
      if (form.city.trim().length < 2) e.city = 'Please enter your city or town.'
      if (!/^\d{6}$/.test(form.pincode)) e.pincode = 'Pincode must be exactly 6 digits.'
    } else {
      if (Number.isNaN(form.monthlyBillRupees) || form.monthlyBillRupees < 0 || form.monthlyBillRupees > 100000) e.monthlyBillRupees = 'Enter your average monthly bill in rupees (0 – 1,00,000).'
      if (!form.consent) e.consent = 'Tick this box so we are allowed to contact you.'
    }
    return e
  }

  const next = () => {
    const errs = validate(0)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setStep(1)
  }

  const submit = async () => {
    const errs = validate(1)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setBusy(true)
    try {
      // if the AI bill scan produced a reading, attach it as a note so the
      // sales team sees the units + suggested size on the lead timeline
      let notes: string | null = null
      if (billScan && (billScan.monthlyUnits != null || billScan.billAmount != null)) {
        const bits: string[] = []
        if (billScan.monthlyUnits != null) bits.push(`~${billScan.monthlyUnits} units/month`)
        if (billScan.billAmount != null) bits.push(`bill ₹${billScan.billAmount}`)
        notes = `[AI bill scan] ${bits.join(', ')}${billScan.suggestedKw != null ? ` → suggested ${billScan.suggestedKw} kW system` : ''}`
      }
      const r = await api('/public/enquiries', { method: 'POST', json: notes ? { ...form, notes } : form })
      setDone({ reference: r.reference, portalToken: r.portalToken ?? null, message: r.message })
    } catch (e: any) {
      // server-side validation: highlight the exact fields the API rejected
      if (e?.code === 'VALIDATION_FAILED' && Array.isArray(e.details) && e.details.length) {
        const map: Record<string, string> = {}
        for (const d of e.details) {
          const key = String(d.path ?? '')
          if (key === 'consent') map.consent = 'Tick this box so we are allowed to contact you.'
          else if (key === 'monthlyBillRupees') map.monthlyBillRupees = 'Enter your average monthly bill in rupees.'
          else if (key === 'requestedCapacityKw') map.requestedCapacityKw = 'Pick a system size, or choose “Not sure”.'
          else if (ENQUIRY_STEP1_FIELDS.includes(key)) map[key] = d.message
        }
        if (Object.keys(map).length) {
          setErrors(map)
          if (Object.keys(map).some((k) => ENQUIRY_STEP1_FIELDS.includes(k))) setStep(0)
        }
        toast.error(e.message)
      } else {
        toast.error(e.message ?? 'Something went wrong')
      }
    } finally {
      setBusy(false)
    }
  }

  const bad = (k: string) => (errors[k] ? 'border-red-400 focus-visible:ring-red-200' : undefined)
  const errText = (k: string) => errors[k] ? <p className="text-xs text-red-600" role="alert">{errors[k]}</p> : null

  if (done) {
    return (
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
            <h1 className="text-xl font-semibold mt-3">Request received</h1>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              Your reference number is <span className="font-semibold">{done.reference}</span>. Our sales team will contact you
              within 4 business hours. {done.message ?? 'You can follow your progress any time from your personal link.'}
            </p>
            {done.portalToken ? (
              <Button className="mt-5" onClick={() => (window.location.hash = `/p/${done.portalToken}`)}>
                Open My SunPower <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <p className="mt-5 text-sm text-slate-600 max-w-md mx-auto">
                Check your phone for the SMS with your personal SunPower link — it never changes, so an older SMS with the
                same link still works.
              </p>
            )}
            <p className="text-xs text-slate-400 mt-3">Your link stays valid for 90 days.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Request your solar quote</h1>
        <p className="text-sm text-slate-500 mt-1">On-grid and off-grid systems from 1 kW to 5 kW for homes and small factories.</p>
      </div>
      <div className="flex items-center gap-2 text-xs font-medium">
        <span className={cn('flex items-center gap-1.5', step === 0 ? 'text-blue-700' : 'text-green-600')}>
          {step === 0 ? <Circle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Contact details
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        <span className={cn('flex items-center gap-1.5', step === 1 ? 'text-blue-700' : 'text-slate-400')}>
          <Circle className="h-4 w-4" /> Your needs
        </span>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          {step === 0 ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Aarav Patel" className={bad('name')} aria-invalid={!!errors.name} />
                  {errText('name')}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Mobile number</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98XXXXXXXX" inputMode="tel" className={bad('phone')} aria-invalid={!!errors.phone} />
                  {errText('phone')}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Installation address</Label>
                <Input id="address" value={form.addressLine} onChange={(e) => set('addressLine', e.target.value)} placeholder="Flat / house no, society, street, area" className={bad('addressLine')} aria-invalid={!!errors.addressLine} />
                {errText('addressLine')}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} className={bad('city')} aria-invalid={!!errors.city} />
                  {errText('city')}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pin">Pincode</Label>
                  <Input id="pin" value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className={bad('pincode')} aria-invalid={!!errors.pincode} />
                  {errText('pincode')}
                </div>
              </div>
              {/* honeypot (TRD 2.6) */}
              <input tabIndex={-1} autoComplete="off" className="hidden" value={form.honeypot} onChange={(e) => set('honeypot', e.target.value)} />
              <div className="flex justify-end">
                <Button onClick={next}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>System size you have in mind</Label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((kw) => (
                    <button key={kw} type="button" onClick={() => set('requestedCapacityKw', kw)}
                      className={cn('rounded-lg border px-4 py-2 text-sm font-medium transition', form.requestedCapacityKw === kw ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 hover:border-slate-300')}>
                      {kw} kW
                    </button>
                  ))}
                  <button type="button" onClick={() => set('requestedCapacityKw', null)} className={cn('rounded-lg border px-4 py-2 text-sm transition', form.requestedCapacityKw === null ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 hover:border-slate-300')}>
                    Not sure
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>System type</Label>
                <div className="flex gap-2">
                  {[['ON_GRID', 'On-Grid', 'Bill savings, grid-tied'], ['OFF_GRID', 'Off-Grid', 'With battery backup']].map(([v, label, hint]) => (
                    <button key={v} type="button" onClick={() => set('systemTypePref', v)}
                      className={cn('flex-1 rounded-lg border p-3 text-left transition', form.systemTypePref === v ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300')}>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-slate-500">{hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bill">Average monthly electricity bill (Rs)</Label>
                  <Input id="bill" type="number" value={form.monthlyBillRupees} onChange={(e) => set('monthlyBillRupees', Number(e.target.value))} className={bad('monthlyBillRupees')} aria-invalid={!!errors.monthlyBillRupees} />
                  {errText('monthlyBillRupees')}
                  <p className="text-xs text-slate-400">Helps us size the system for you</p>
                </div>
                <div className="space-y-2 flex flex-col justify-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.wantsSubsidy} onChange={(e) => set('wantsSubsidy', e.target.checked)} className="h-4 w-4 accent-blue-700" />
                    I am interested in the government subsidy
                  </label>
                </div>
              </div>
              <BillScanCard onResult={setBillScan} />
              <div className="space-y-1">
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-700" aria-invalid={!!errors.consent} />
                  <span className={errors.consent ? 'text-red-700' : undefined}>I agree that SunPower Solar Energy may contact me about this enquiry and store these details for the quotation and installation. (required)</span>
                </label>
                {errText('consent')}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── AI bill scan (T4): optional bill photo → Gemini extraction → size hint ──

const BILL_SCAN_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_BILL_SCAN_BYTES = 3 * 1024 * 1024

function BillScanCard({ onResult }: { onResult: (r: BillScanResult | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BillScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // revoke the object URL whenever it is replaced or the card unmounts
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const reset = () => {
    setResult(null)
    setError(null)
    onResult(null)
  }

  const pick = (file: File | null) => {
    if (!file) return
    setResult(null)
    setError(null)
    onResult(null)
    if (!BILL_SCAN_MIME.includes(file.type)) {
      toast.warning('Please choose a JPG, PNG, WebP or HEIC photo of the bill.')
      return
    }
    if (file.size > MAX_BILL_SCAN_BYTES) {
      toast.warning('That photo is over 3 MB — please choose a smaller image.')
      return
    }
    setPreview((url) => { if (url) URL.revokeObjectURL(url); return URL.createObjectURL(file) })
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = String(reader.result ?? '').replace(/^data:[^;]+;base64,/, '')
      setBusy(true)
      try {
        const r = await api<BillScanResult>('/ai/bill-scan', { method: 'POST', json: { imageBase64: base64, mimeType: file.type } })
        if (r?.extractError) {
          setError('We couldn’t read that bill automatically — no problem, the form works fine without it.')
          return
        }
        setResult(r)
        onResult(r)
      } catch (e: any) {
        // amber toast with the API's own message (e.g. invalid Gemini key);
        // the form stays fully usable without the scan
        toast.warning(e?.message ?? 'Bill scan failed — you can still submit the form normally.')
        setError(e?.message ?? 'Bill scan failed.')
      } finally {
        setBusy(false)
      }
    }
    reader.onerror = () => toast.warning('Could not read that file.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Camera className="h-4 w-4 mt-0.5 text-slate-500 shrink-0" />
        <div>
          <p className="text-sm font-medium">Upload your electricity bill (optional)</p>
          <p className="text-xs text-slate-500">We’ll read it with AI and estimate the right system size for you.</p>
        </div>
      </div>
      {!preview ? (
        <div>
          {/* capture="environment" opens the rear camera on mobile; desktops show the file picker */}
          <input
            id="bill-photo"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = '' }}
          />
          <label
            htmlFor="bill-photo"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <Camera className="h-4 w-4" /> Take or upload a photo
          </label>
        </div>
      ) : (
        <div className="grid sm:grid-cols-[150px_1fr] gap-3 items-start">
          <PhotoThumb url={preview} label="Bill photo" onRemove={reset} />
          <div className="space-y-2 min-w-0">
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-600" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading your bill…
              </div>
            )}
            {!busy && result && (result.monthlyUnits != null || result.billAmount != null) && (
              <>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  ≈ {result.monthlyUnits ?? '—'} units/month{result.billAmount != null && <> · bill ₹{result.billAmount.toLocaleString('en-IN')}</>} → suggested system:{' '}
                  <strong>{result.suggestedKw != null ? `${result.suggestedKw} kW` : '—'}</strong>
                </div>
                <p className="text-xs text-slate-500">We’ll attach this reading to your enquiry so our team can size your system accurately.</p>
              </>
            )}
            {!busy && result && result.monthlyUnits == null && result.billAmount == null && (
              <p className="text-sm text-amber-700">We read the photo but couldn’t find the usage figures — the form still works normally.</p>
            )}
            {!busy && error && (
              <p className="text-sm text-amber-700" role="alert">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── customer home: public self-service page (quote, tracking, warranty) ──

export function HomeView() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-blue-800 via-blue-700 to-amber-500 text-white p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-semibold leading-tight max-w-2xl">
          Cut your electricity bill with rooftop solar — installed, monitored and warrantied by SunPower.
        </h1>
        <p className="mt-3 text-blue-100 max-w-2xl text-sm sm:text-base">
          On-grid and off-grid systems from 1 kW to 5 kW for homes and small factories in Ahmedabad and across Gujarat.
          Subsidy paperwork handled end to end.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="lg" className="bg-white text-blue-800 hover:bg-blue-50" onClick={() => (window.location.hash = '/e')}>
            Request a free quote <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {['Free site survey', 'Subsidy up to Rs 78,000', '20-year panel warranty', 'Callback within 4 business hours'].map((t) => (
            <span key={t} className="rounded-full bg-white/10 border border-white/20 px-3 py-1">{t}</span>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 items-start">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><FileText className="h-5 w-5" /></div>
            <div className="text-sm font-semibold">Get a quote</div>
            <p className="text-sm text-slate-500">
              Answer a few quick questions — no site visit needed to start. We reply within 4 business hours with a reference number.
            </p>
            <Button size="sm" variant="outline" onClick={() => (window.location.hash = '/e')}>Start the form</Button>
          </CardContent>
        </Card>

        <RequestFreshLink />

        <WarrantyLookupCard />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">What happens after you request a quote</div>
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              ['1', 'Callback', 'Our sales team calls within 4 business hours.'],
              ['2', 'Free survey', 'An engineer measures your roof and checks the wiring.'],
              ['3', 'Fixed quote', 'Every panel, inverter and cable itemised — no surprises.'],
              ['4', 'Install & warranty', '1–2 days on site, then a certificate and 20-year cover.'],
            ].map(([n, title, body]) => (
              <div key={n} className="rounded-lg border bg-slate-50/60 p-3">
                <div className="grid h-6 w-6 place-items-center rounded-full bg-blue-700 text-white text-xs font-semibold">{n}</div>
                <div className="text-sm font-medium mt-2">{title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{body}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function WarrantyLookupCard() {
  const [serial, setSerial] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  const lookup = async () => {
    const s = serial.trim()
    if (!s || busy) return
    setBusy(true); setErr(null); setResult(null)
    try {
      setResult(await api(`/public/warranty-lookup?serial=${encodeURIComponent(s)}`))
    } catch (e: any) {
      setErr(e.message ?? 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><ShieldCheck className="h-5 w-5" /></div>
        <div className="text-sm font-semibold">Check your warranty</div>
        <p className="text-sm text-slate-500">Type the serial number from the equipment label or your completion certificate.</p>
        <div className="flex gap-2">
          <Input
            value={serial}
            onChange={(e) => { setSerial(e.target.value); setErr(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') lookup() }}
            placeholder="e.g. PNL540-26A-000500"
            aria-label="Serial number"
          />
          <Button disabled={busy || !serial.trim()} onClick={lookup}>{busy ? 'Checking…' : 'Check'}</Button>
        </div>
        {err && <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="alert">{err}</div>}
        {result && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-medium">{result.unit.product}</div>
              <span className="font-mono text-xs text-slate-500">{result.unit.serialNumber}</span>
            </div>
            {result.warranty ? (
              <>
                <WarrantyBar start={result.warranty.startDate} end={result.warranty.endDate} daysLeft={result.warranty.daysLeft} />
                <div className="text-xs text-slate-500">
                  {result.verdict === 'IN_WARRANTY'
                    ? 'Covered — service visits under warranty are free of charge.'
                    : result.verdict === 'EXCLUDED'
                      ? 'Warranty was voided (damage or tampering recorded). Contact the service desk.'
                      : 'Warranty has ended — repairs are chargeable; call us for a quote.'}
                </div>
              </>
            ) : result.verdict === 'EXCLUDED' ? (
              <div className="text-xs text-red-700">Warranty was voided (damage or tampering recorded). Contact the service desk.</div>
            ) : (
              <div className="text-xs text-slate-500">No active warranty on this unit — repairs are chargeable; call us for a quote.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── S8: quote page (public link) ──────────────────────────────────

export function QuoteView({ token }: { token: string }) {
  // live quote: a sales revision or an accept/reject recorded by phone shows
  // up here without a reload
  const { data, loading, error, reload, refreshing, refreshedAt } = useData(
    () => api(`/public/quotes/${token}`), [token], { pollMs: 30000, refetchOnFocus: true }
  )
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [last4, setLast4] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  if (loading) return <Loading />
  if (error) return <Alert tone="warn" title="This link is not valid">{error}</Alert>

  const q = data.quote
  const viaPortal = !!data.viaPortal
  if (outcome) {
    return (
      <div className="space-y-4">
        {viaPortal && (
          <div><a href={`#/p/${token}`} className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back to My SunPower</a></div>
        )}
        <Card className={outcome.includes('accepted') ? 'border-green-200 bg-green-50/40' : 'border-amber-200 bg-amber-50/40'}>
          <CardContent className="p-6 text-center space-y-2">
            <CheckCircle2 className={cn('h-10 w-10 mx-auto', outcome.includes('accepted') ? 'text-green-600' : 'text-amber-600')} />
            <h1 className="text-lg font-semibold">{outcome.includes('accepted') ? 'Quote accepted — thank you!' : 'Noted, thank you for telling us'}</h1>
            <p className="text-sm text-slate-600">
              {outcome.includes('accepted')
                ? `Your order has been created. Our team will call you to record the advance payment and confirm the installation date.`
                : 'Your reason has been shared with our sales team, who will contact you with a revised offer if you would like one.'}
            </p>
            <p className="text-xs text-slate-400">Reference {q.quoteNumber}</p>
            {viaPortal && (
              <Button className="mt-3" onClick={() => (window.location.hash = `/p/${token}`)}>
                Follow your project in My SunPower <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const doVerify = async () => {
    setBusy(true)
    try {
      await api(`/portal/${token}/verify`, { method: 'POST', json: { last4 } })
      setVerified(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const accept = async () => {
    setBusy(true)
    try {
      const r = await api(`/public/quotes/${token}/accept`, { method: 'POST', json: { acceptedName: name } })
      setOutcome(`accepted:${r.orderNumber}`)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const reject = async () => {
    setBusy(true)
    try {
      await api(`/public/quotes/${token}/reject`, { method: 'POST', json: { reason } })
      setOutcome('rejected')
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const canDecide = q.status === 'SENT'

  return (
    <div className="space-y-4">
      {viaPortal && (
        <div><a href={`#/p/${token}`} className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back to My SunPower</a></div>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Quotation {q.quoteNumber} · version {q.version}</div>
          <h1 className="text-2xl font-semibold">{q.capacityKw} kW {q.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} solar system</h1>
          <p className="text-sm text-slate-500 mt-0.5">Valid until {fmtDate(q.validUntil)} · Prepared for {q.customerName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canDecide && <span className="rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium px-3 py-1">Action needed</span>}
          <Button variant="outline" size="sm" onClick={() => setPrinting(true)}><Printer className="h-3.5 w-3.5 mr-1" /> Print / save PDF</Button>
        </div>
      </div>
      <LiveBadge refreshedAt={refreshedAt} refreshing={refreshing} onRefresh={() => void reload()} />

      {q.savings && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-amber-900 flex items-center gap-1.5"><Sun className="h-4 w-4" /> What this system can do for you (estimates)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-center">
              <div><div className="text-lg font-semibold tabular-nums">{num(q.savings.annualGenerationKwh)} kWh</div><div className="text-xs text-slate-500">generation per year</div></div>
              <div><div className="text-lg font-semibold tabular-nums">{money(q.savings.annualSavingsPaise)}</div><div className="text-xs text-slate-500">savings per year</div></div>
              <div><div className="text-lg font-semibold">{q.savings.paybackYears != null ? `≈ ${q.savings.paybackYears} yr` : '—'}</div><div className="text-xs text-slate-500">payback (estimate)</div></div>
              <div><div className="text-lg font-semibold">{q.savings.recommendedKw} kW</div><div className="text-xs text-slate-500">recommended size</div></div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Estimates depend on location, orientation, shading and weather. Your roof measurements will be verified before installation.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Parts list (every part included)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium text-right">Qty</th>
                <th className="px-4 py-2 font-medium text-right">Rate</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2">{l.description}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(l.qty)} {l.uom.toLowerCase()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{money(l.unitPricePaise)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{money(l.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 space-y-1 text-sm border-t bg-slate-50/60">
            <Row label="Subtotal" value={money(q.subtotalPaise)} />
            {q.discountPaise > 0 && <Row label="Discount" value={'− ' + money(q.discountPaise)} />}
            <Row label="Tax (GST)" value={money(q.taxPaise)} />
            <Row label="Total" value={money(q.totalPaise)} bold />
            {q.subsidyEstimatePaise > 0 && <Row label="Indicative subsidy (not deducted; we help you apply)" value={money(q.subsidyEstimatePaise)} muted />}
          </div>
        </CardContent>
      </Card>

      {canDecide && !verified && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Lock className="h-4 w-4 text-slate-500" /> Verify it is you</div>
            <p className="text-sm text-slate-500">Enter the last 4 digits of the phone number this quote was sent to.</p>
            <div className="flex gap-2">
              <Input className="w-32 tracking-widest" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
              <Button onClick={doVerify} disabled={last4.length !== 4 || busy}>Verify</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canDecide && verified && (
        <Card className="border-blue-200">
          <CardContent className="p-5 space-y-4">
            <div className="text-sm font-medium">Accept or reject this quote</div>
            <div className="grid gap-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">Accept</div>
                <p className="text-xs text-slate-500">Type your full name to confirm. Your order will be created and our team will call you for the advance payment.</p>
                <div className="flex gap-2">
                  <Input placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
                  <Button disabled={name.trim().length < 2 || busy} onClick={accept}>Accept quote</Button>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">Reject with a reason</div>
                <p className="text-xs text-slate-500">Telling us why helps us improve the offer. You are not charged anything.</p>
                <Textarea placeholder="For example: too expensive, need smaller system, will decide next month…" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                <Button variant="outline" disabled={reason.trim().length < 3 || busy} onClick={reject}>Send rejection</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!canDecide && (
        <Alert tone={q.status === 'ACCEPTED' ? 'success' : q.status === 'REJECTED' ? 'warn' : 'neutral'} title={`This quote is ${q.status.toLowerCase()}`}>
          {q.status === 'REJECTED' && q.rejectReason ? `Your reason: “${q.rejectReason}”. ` : ''}
          {q.status === 'EXPIRED' ? 'Ask SunPower for a revision with current prices.' : 'Ask SunPower for a fresh link if you need to see it again.'}
        </Alert>
      )}

      {printing && (
        <PrintOverlay title={`Quotation ${q.quoteNumber}`} onClose={() => setPrinting(false)}>
          <QuoteDoc
            q={{
              quoteNumber: q.quoteNumber, version: q.version, status: q.status, capacityKw: q.capacityKw, systemType: q.systemType,
              validUntil: q.validUntil, subtotalPaise: q.subtotalPaise, discountPaise: q.discountPaise, taxPaise: q.taxPaise,
              totalPaise: q.totalPaise, subsidyEstimatePaise: q.subsidyEstimatePaise,
              lines: q.lines.map((l: any) => ({ description: l.description, qty: l.qty, uom: l.uom, unitPricePaise: l.unitPricePaise, lineTotalPaise: l.lineTotalPaise })),
              customerName: q.customerName, savings: q.savings,
            }}
            branding={data.branding}
          />
        </PrintOverlay>
      )}
    </div>
  )
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between', bold && 'font-semibold text-base pt-1', muted && 'text-slate-500 text-xs')}>
      <span className={cn(!bold && 'text-slate-500')}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

// ── S22: My SunPower portal ───────────────────────────────────────

/** "Live" freshness pill for customer pages: pulsing dot, an "updated Xs
 *  ago · auto-refresh on" line that re-ticks every few seconds, and a manual
 *  refresh — reassures the customer the page tracks staff work. */
function LiveBadge({ refreshedAt, refreshing, onRefresh }: { refreshedAt: number | null; refreshing?: boolean; onRefresh: () => void }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  const ago = refreshedAt ? relTime(new Date(refreshedAt)) : null
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 font-medium text-green-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        Live · auto-refresh on
      </span>
      {ago && <span className="hidden sm:inline text-slate-400">updated {ago}</span>}
      <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={onRefresh} disabled={refreshing} aria-label="Refresh now" title="Refresh now">
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
      </Button>
    </div>
  )
}

/** Skeleton for the portal's first load — hero, journey timeline and cards —
 *  so the customer never stares at a blank page. */
function PortalSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your portal">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid sm:grid-cols-2 gap-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  )
}

/** The eight-stage tracker (App Flow 4.2): a vertical timeline on phones so
 *  every step is readable without sideways scrolling, horizontal on desktop.
 *  `details[i]` adds a real fact under a step (reference number, date…) and
 *  is rendered only where the bundle actually has one. */
function StageTracker({ stage, details }: { stage: number; details?: (string | null)[] }) {
  const stages = CUSTOMER_STAGES
  const detail = (i: number) => details?.[i] ?? null
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">Your order journey</div>
        <ol className="sm:hidden">
          {stages.map((s, i) => {
            const n = i + 1
            const state = stage > n ? 'done' : stage === n ? 'current' : 'todo'
            return (
              <li key={s.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
                    state === 'done' ? 'bg-green-500 border-green-500 text-white'
                      : state === 'current' ? 'border-blue-600 text-blue-700 bg-blue-50'
                        : 'border-slate-200 text-slate-300 bg-white')}>
                    {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : n}
                  </span>
                  {n < stages.length && <span className={cn('w-0.5 flex-1 min-h-5', stage > n ? 'bg-green-500' : 'bg-slate-200')} />}
                </div>
                <div className={cn('pb-4 min-w-0', n === stages.length && 'pb-0')}>
                  <div className={cn('text-sm leading-7', state === 'current' ? 'font-semibold text-blue-800' : state === 'done' ? 'text-slate-700' : 'text-slate-400')}>{s.label}</div>
                  <div className={cn('text-xs -mt-0.5', state === 'current' ? 'text-blue-700' : 'text-slate-400')}>{s.hint}</div>
                  {detail(i) && <div className={cn('text-xs mt-0.5 truncate', state === 'todo' ? 'text-slate-300' : 'text-slate-500')}>{detail(i)}</div>}
                </div>
              </li>
            )
          })}
        </ol>
        <div className="hidden sm:flex items-start justify-between overflow-x-auto pb-1">
          {stages.map((s, i) => {
            const n = i + 1
            const state = stage > n ? 'done' : stage === n ? 'current' : 'todo'
            return (
              <div key={s.label} className="flex items-start">
                <div className="flex flex-col items-center gap-1 min-w-16">
                  <span className={cn('grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-semibold',
                    state === 'done' ? 'bg-green-500 border-green-500 text-white'
                      : state === 'current' ? 'border-blue-600 text-blue-700 bg-blue-50'
                        : 'border-slate-200 text-slate-300 bg-white')}>
                    {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : n}
                  </span>
                  <span className={cn('text-[10px] leading-tight text-center', state === 'current' ? 'text-blue-700 font-semibold' : 'text-slate-400')}>{s.label}</span>
                  {detail(i) && <span className={cn('text-[10px] leading-tight text-center max-w-20 truncate', state === 'todo' ? 'text-slate-300' : 'text-slate-500')}>{detail(i)}</span>}
                </div>
                {i < stages.length - 1 && <div className={cn('h-0.5 w-4 lg:w-8 mt-3.5', stage > n ? 'bg-green-500' : 'bg-slate-200')} />}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export function PortalView({ token }: { token: string }) {
  // live portal: polls every 30 s — but only while the tab is visible AND
  // focused — and refreshes when the customer comes back, so staff/technician
  // updates appear without a reload
  const { data, loading, error, reload, refreshing, refreshedAt } = useData(
    () => api(`/portal/${token}`), [token], { pollMs: 30000, refetchOnFocus: true }
  )
  const [verified, setVerified] = useState(false)
  const [last4, setLast4] = useState('')
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState<'invoice' | 'warranty' | null>(null)
  const [docData, setDocData] = useState<any>(null)
  const isVerified = verified || !!data?.verified

  const openInvoiceDoc = async (inv: any) => {
    setBusy(true)
    try {
      const r = await api(`/portal/${token}/invoice`, { method: 'POST', json: { invoiceNumber: inv.number, last4 } })
      setDocData(r)
      setPrinting('invoice')
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const openWarrantyDoc = async (w: any) => {
    setBusy(true)
    try {
      const r = await api(`/portal/${token}/warranty`, { method: 'POST', json: { warrantyId: w.id } })
      setDocData(r)
      setPrinting('warranty')
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (loading) return <PortalSkeleton />
  if (error) return (
    <div className="space-y-4">
      <Alert tone="warn" title="This link is not valid">{error}</Alert>
      <RequestFreshLink />
    </div>
  )

  const p = data

  const doVerify = async () => {
    setBusy(true)
    try {
      await api(`/portal/${token}/verify`, { method: 'POST', json: { last4 } })
      setVerified(true)
      void reload()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  // at-a-glance figures and the single most useful next action
  const stageInfo = CUSTOMER_STAGES[Math.min(Math.max(p.stage, 1), CUSTOMER_STAGES.length) - 1]
  const systemKw = p.order?.capacityKw ?? p.quote?.capacityKw ?? null
  const total = p.order?.totalPaise ?? null
  const paid = p.order?.paidPaise ?? 0
  const balance = total != null ? Math.max(0, total - paid) : null
  const paidPct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0
  // stage colour: early paperwork = blue, mid-project = amber, live system = green
  const stageTone = p.stage >= 7 ? 'bg-green-600' : p.stage >= 4 ? 'bg-amber-500' : 'bg-blue-700'
  const nextAction = (() => {
    if (p.quote && p.quote.status === 'SENT') {
      return { label: `Your quotation is ready — ${p.quote.quoteNumber} · ${p.quote.capacityKw} kW · ${money(p.quote.totalPaise)}, valid until ${fmtDate(p.quote.validUntil)}.`, cta: 'Open quotation', to: `/q/${token}` }
    }
    if (p.order?.status === 'PENDING_ADVANCE') {
      return { label: `Advance payment of ${money(p.order.advanceRequiredPaise)} is pending — you can pay it online below, or our team will call you.`, cta: null, to: null }
    }
    if (p.installation?.scheduledOn && ['SCHEDULED'].includes(p.installation.status)) {
      return { label: `Installation scheduled for ${fmtDate(p.installation.scheduledOn)}${p.installation.slot ? ` (${p.installation.slot.toLowerCase()})` : ''}.`, cta: null, to: null }
    }
    if (p.installation && ['IN_PROGRESS', 'AWAITING_SIGNOFF'].includes(p.installation.status)) {
      return { label: `Installation in progress${p.installation.crewLeadName ? ` — crew lead ${p.installation.crewLeadName}` : ''}.`, cta: null, to: null }
    }
    if (total != null && paid >= total && total > 0) {
      return { label: 'Fully paid — thank you!', cta: null, to: null }
    }
    return null
  })()
  // journey facts: rendered under a timeline step only when the bundle has one
  const journeyDetails: (string | null)[] = [
    p.lead ? `Ref ${p.lead.number}` : null,
    null, // survey date is not exposed in the customer bundle
    p.quote ? p.quote.quoteNumber : null,
    p.order ? p.order.number : null,
    p.order && ['READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'CLOSED'].includes(p.order.status)
      ? p.order.status === 'READY_TO_DISPATCH' ? 'equipment being prepared' : 'equipment dispatched'
      : null,
    p.installation?.scheduledOn ? `${fmtDate(p.installation.scheduledOn)}${p.installation.slot ? ` · ${p.installation.slot.toLowerCase()}` : ''}` : null,
    p.installation?.certificateReady ? 'certificate ready' : null,
    (p.warrantyBars ?? []).length > 0 ? `${p.warrantyBars.length} activ${p.warrantyBars.length === 1 ? 'e' : 'e'} warrant${p.warrantyBars.length === 1 ? 'y' : 'ies'}` : null,
  ]

  return (
    <div className="space-y-5">
      {/* sticky header: who this is + live indicator, stays visible while scrolling */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">My SunPower</div>
            <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate">Hello, {p.customer.name}</h1>
            <div className="text-[11px] text-slate-400 hidden sm:block">Track your solar project — updated automatically as our team works</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <LiveBadge refreshedAt={refreshedAt} refreshing={refreshing} onRefresh={() => void reload()} />
            {isVerified && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> verified for invoices &amp; service
              </span>
            )}
          </div>
        </div>
      </div>

      {/* hero summary: stage badge, key numbers, next step, outstanding balance */}
      <Card className="border-blue-100">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3 flex-wrap">
            <span className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold text-white', stageTone)}>
              <Sun className="h-4 w-4" /> {stageInfo.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{stageInfo.hint} <span className="text-slate-400 font-normal">· step {p.stage} of {CUSTOMER_STAGES.length}</span></div>
              <div className="text-xs text-slate-400">{p.message}</div>
            </div>
          </div>
          {nextAction && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-blue-900 min-w-0">{nextAction.label}</div>
              {nextAction.to && (
                <Button size="sm" className="shrink-0" onClick={() => (window.location.hash = nextAction.to!)}>
                  {nextAction.cta} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </div>
          )}
          {(systemKw != null || total != null) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <Field label="System size">{systemKw != null ? `${num(systemKw)} kW` : '—'}</Field>
              <Field label="Order">{p.order ? p.order.number : '—'}</Field>
              <Field label="Paid so far">{total != null ? money(paid) : '—'}</Field>
              <Field label="Balance">{balance != null ? money(balance) : '—'}</Field>
            </div>
          )}
          {balance != null && balance > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-amber-900"><span className="font-semibold">Outstanding balance {money(balance)}</span> — pay securely online below.</div>
            </div>
          )}
          {total != null && total > 0 && (
            <div>
              <Progress value={paidPct} />
              <div className="text-[11px] text-slate-400 mt-1">{paidPct}% of the order value paid</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* order journey: eight-stage vertical timeline (horizontal on desktop) */}
      <StageTracker stage={p.stage} details={journeyDetails} />

      {/* installation info */}
      {p.installation && (
        <Card>
          <CardContent className="p-4 grid sm:grid-cols-3 gap-4">
            <Field label="Installation date">{p.installation.scheduledOn ? fmtDate(p.installation.scheduledOn) : 'To be confirmed'}{p.installation.slot ? ` · ${p.installation.slot.toLowerCase()}` : ''}</Field>
            <Field label="Crew lead">{p.installation.crewLeadName ?? 'To be assigned'}<div className="text-xs text-slate-400">Company contact: {p.company?.phone ?? ''}</div></Field>
            <Field label="Status">{p.installation.status.replace(/_/g, ' ').toLowerCase()}</Field>
          </CardContent>
        </Card>
      )}

      {/* equipment + warranties */}
      {p.equipment.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-600" /> Your equipment and warranties</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {p.equipment.map((e: any, i: number) => {
              const bar = (p.warrantyBars ?? []).find((w: any) => w.serial === e.serial)
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium">{e.product} <span className="font-mono text-xs text-slate-400">SN {e.serial}</span></div>
                    <div className="flex items-center gap-2">
                      {e.monitoringUrl && <a href={e.monitoringUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">Open monitoring app ↗</a>}
                      {bar && bar.status === 'ACTIVE' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => openWarrantyDoc(bar)}><FileText className="h-3 w-3 mr-1" /> Warranty document</Button>
                      )}
                    </div>
                  </div>
                  {e.warranty ? <WarrantyBar start={e.warranty.startDate} end={e.warranty.endDate} daysLeft={daysUntil(e.warranty.endDate)} /> : <div className="text-xs text-slate-400">Warranty starts at delivery</div>}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* gallery + certificate */}
      {p.gallery.after.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4" /> Before / after</CardTitle></CardHeader>
          <CardContent>
            {p.gallery.before.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Before — survey</div>
                <div className="grid grid-cols-3 gap-2 mb-4">{p.gallery.before.map((ph: any) => <PhotoThumb key={ph.id} url={ph.url} label="Survey photo" />)}</div>
              </>
            )}
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">After — installation</div>
            <div className="grid grid-cols-3 gap-2">{p.gallery.after.map((ph: any) => <PhotoThumb key={ph.id} url={ph.url} label={ph.kind.toLowerCase()} />)}</div>
          </CardContent>
        </Card>
      )}

      {p.installation?.certificateReady && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-700" />
              <div>
                <div className="text-sm font-semibold">Completion certificate</div>
                <div className="text-xs text-slate-500">Installed capacity {p.installation.installedCapacityKw} kWp, tested and signed off</div>
              </div>
            </div>
            <Button variant="outline" onClick={() => (window.location.hash = `/c/${token}`)}>View certificate</Button>
          </CardContent>
        </Card>
      )}

      {/* payments: invoice history after phone verify (totals live in the hero) */}
      {(p.order || p.invoices.length > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Payments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {p.order && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Order total">{money(p.order.totalPaise)}</Field>
                <Field label="Paid so far">{money(p.order.paidPaise)}</Field>
                <Field label="Balance due">{money(Math.max(0, p.order.totalPaise - p.order.paidPaise))}</Field>
              </div>
            )}
            {/* T2: pay the outstanding balance online (Razorpay Checkout, test mode) */}
            <PayOnlineCard token={token} order={p.order} reload={reload} />
            {(!isVerified && (p.invoices.length > 0 || !!p.order)) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="text-sm text-slate-600 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 shrink-0" /> See your invoices and payment history — verify with the last 4 digits of your registered phone:</div>
                <div className="flex gap-2">
                  <Input className="w-28 tracking-widest" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="••••" aria-label="Last 4 digits of your phone" />
                  <Button size="sm" className="h-10" disabled={last4.length !== 4 || busy} onClick={doVerify}>Verify</Button>
                </div>
              </div>
            )}
            {isVerified && (
              <>
                {p.invoices.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400 border-b"><th className="py-1.5 font-medium">Invoice</th><th className="font-medium">Date</th><th className="font-medium">Type</th><th className="font-medium text-right">Amount</th><th className="font-medium text-right">Status</th><th className="font-medium text-right">PDF</th></tr></thead>
                    <tbody>
                      {p.invoices.map((inv: any) => (
                        <tr key={inv.number} className="border-b last:border-0">
                          <td className="py-1.5 font-mono text-xs">{inv.number}</td>
                          <td>{fmtDate(inv.issueDate)}</td>
                          <td className="capitalize">{inv.type.toLowerCase()}</td>
                          <td className="text-right tabular-nums">{money(inv.totalPaise)}</td>
                          <td className="text-right"><span className={cn('text-xs font-medium rounded px-1.5 py-0.5', inv.status === 'PAID' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>{inv.status.toLowerCase()}</span></td>
                          <td className="text-right"><Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => openInvoiceDoc(inv)}><FileText className="h-3 w-3 mr-1" /> PDF</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {p.payments && p.payments.length > 0 && (
                  <div className="text-xs text-slate-400">Payments received: {p.payments.length} · Total {money(p.payments.reduce((s: number, x: any) => s + x.amountPaise, 0))}</div>
                )}
                {p.payments && p.payments.length === 0 && (
                  <div className="text-xs text-slate-400">No payments yet — they will appear here as soon as we receive one.</div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* service requests */}
      <ServiceRequests token={token} verified={isVerified} onVerified={() => setVerified(true)} tickets={p.tickets} reload={reload} />

      {/* contact & support: real company details from the portal bundle */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Contact &amp; support</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Phone"><a className="text-blue-700 underline" href={`tel:${(p.company?.phone ?? '+91 79 4000 1234').replace(/\s+/g, '')}`}>{p.company?.phone ?? '+91 79 4000 1234'}</a></Field>
          <Field label="Email">{p.company?.email ? <a className="text-blue-700 underline" href={`mailto:${p.company.email}`}>{p.company.email}</a> : 'care@sunpowersolar.in'}</Field>
          <Field label="Company">{p.company?.name ?? 'SunPower Solar Energy'}</Field>
          <Field label="Response time">within 4 business hours</Field>
        </CardContent>
      </Card>

      {printing === 'invoice' && docData && (
        <PrintOverlay title={`Invoice ${docData.invoice.invoiceNumber}`} onClose={() => setPrinting(null)}>
          <InvoiceDoc inv={docData.invoice} branding={docData.branding} />
        </PrintOverlay>
      )}
      {printing === 'warranty' && docData && (
        <PrintOverlay title="Warranty certificate" onClose={() => setPrinting(null)}>
          <WarrantyDoc w={docData.warranty} branding={docData.branding} />
        </PrintOverlay>
      )}
    </div>
  )
}

// ── T2: pay online (Razorpay Checkout) ─────────────────────────────

interface RazorpayCheckoutOptions {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description: string
  theme: { color: string }
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void
}

interface RazorpayCheckout {
  open: () => void
  on: (event: string, cb: (response: unknown) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout
  }
}

/** load checkout.js exactly once; concurrent callers wait for the same script tag */
function loadRazorpayCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    let script = document.getElementById('razorpay-checkout-js') as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = 'razorpay-checkout-js'
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)
    }
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => {
      script?.remove()
      reject(new Error('Could not load the payment window — check your internet connection and try again.'))
    }, { once: true })
  })
}

/** "Pay now" card: creates a gateway order for the outstanding balance, opens
 *  Razorpay Checkout, confirms the payment server-side (signature check) and
 *  refreshes the portal data so the new payment shows up immediately. */
function PayOnlineCard({ token, order, reload }: {
  token: string
  order: { id: string; number: string; status: string; totalPaise: number; paidPaise: number } | null
  reload: () => void
}) {
  const [creating, setCreating] = useState(false)
  const outstanding = order ? Math.max(0, order.totalPaise - order.paidPaise) : 0
  // shown only when there is something to pay on a live order
  if (!order || outstanding <= 0 || order.status === 'CANCELLED') return null

  const settle = () => setCreating(false)

  const confirmPayment = async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
    try {
      await api('/public/portal/pay/verify', {
        method: 'POST',
        json: { token, orderId: order.id, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature },
      })
      toast.success('Payment successful — receipt updated')
      void reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Payment received but could not be confirmed. If money was deducted it will reflect here shortly — or call us.')
    } finally {
      settle()
    }
  }

  const onPay = async () => {
    if (creating) return // double-click guard while the order is being created
    setCreating(true)
    let checkout: RazorpayCheckout
    try {
      const r = await api<{ razorpayOrderId: string; amountInPaise: number; currency: string; keyId: string }>(
        '/public/portal/pay',
        { method: 'POST', json: { token, orderId: order.id } }
      )
      if (!r.keyId) throw new Error('Online payments are not configured. Please contact SunPower support.')
      await loadRazorpayCheckout()
      if (!window.Razorpay) throw new Error('Could not load the payment window — check your internet connection and try again.')
      checkout = new window.Razorpay({
        key: r.keyId,
        amount: r.amountInPaise,
        currency: r.currency,
        order_id: r.razorpayOrderId,
        name: 'SunPower Solar',
        description: `Order ${order.number}`,
        theme: { color: '#f59e0b' },
        handler: (resp) => void confirmPayment(resp),
      })
    } catch (e: any) {
      // e.g. gateway rejected our keys — show the API's own message
      toast.error(e?.message ?? 'Could not start the payment — please try again.')
      settle()
      return
    }
    checkout.on('payment.failed', (raw) => {
      const desc = (raw as { error?: { description?: string } })?.error?.description
      toast.error(desc ?? 'Payment failed — no money was charged. Please try again.')
    })
    checkout.on('modal.dismiss', settle)
    checkout.open()
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <CreditCard className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="text-sm min-w-0">
            <span className="font-medium text-slate-800">Pay online</span>
            <span className="text-slate-500"> — order {order.number}</span>
            <div className="text-xs text-slate-500">Outstanding balance <span className="font-semibold text-slate-800">{money(outstanding)}</span></div>
          </div>
        </div>
        <Button size="sm" className="shrink-0 h-10" disabled={creating} onClick={onPay}>
          {creating ? 'Opening payment…' : 'Pay now (UPI / Card / NetBanking)'}
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">Secure payment via Razorpay. A receipt is emailed to you instantly and the balance on this page updates once the payment is confirmed.</p>
    </div>
  )
}

function ServiceRequests({ token, verified, onVerified, tickets, reload }: { token: string; verified: boolean; onVerified: () => void; tickets: any[]; reload: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ category: string; description: string; unitId: string; faultCode: string }>({ category: 'NO_POWER', description: '', unitId: '', faultCode: '' })
  const [busy, setBusy] = useState(false)
  const [last4, setLast4] = useState('')
  const [faultData, setFaultData] = useState<any>(null)
  const [photos, setPhotos] = useState<File[]>([])

  // FR-7.9: per-model fault codes for the customer's own units
  useEffect(() => {
    if (!verified) return
    api(`/portal/${token}/fault-codes`, { method: 'POST' }).then(setFaultData).catch(() => setFaultData(null))
  }, [verified, token])

  const uploadPhotos = async (): Promise<string[]> => {
    const ids: string[] = []
    for (const f of photos.slice(0, 4)) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('ownerType', 'TICKET')
      fd.append('ownerId', 'pending:portal')
      fd.append('kind', 'EXTRA')
      fd.append('portalToken', token)
      const res = await fetch('/api/v1/uploads', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('A photo could not be uploaded — try again or submit without it.')
      const r = await res.json()
      ids.push(r.attachmentId)
    }
    return ids
  }

  const verify = async () => {
    try {
      await api(`/portal/${token}/verify`, { method: 'POST', json: { last4 } })
      onVerified()
    } catch (e: any) { toast.error(e.message) }
  }

  const submit = async () => {
    setBusy(true)
    try {
      const ids = photos.length > 0 ? await uploadPhotos() : []
      const r = await api(`/portal/${token}/tickets`, {
        method: 'POST',
        json: {
          category: form.category,
          description: form.description,
          unitId: form.unitId || undefined,
          faultCode: form.faultCode || undefined,
          photoIds: ids,
        },
      })
      toast.success(`Service request ${r.ticketNumber} created. ${VERDICT_COPY[r.verdict]?.label ?? ''} — our team will call you.`)
      setOpen(false)
      setForm({ category: 'NO_POWER', description: '', unitId: '', faultCode: '' })
      setPhotos([])
      reload()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const act = async (ticketNumber: string, action: 'CONFIRM' | 'REOPEN') => {
    try {
      await api(`/portal/${token}/ticket-action`, { method: 'POST', json: { ticketNumber, action } })
      toast.success(action === 'CONFIRM' ? 'Thank you for confirming the repair.' : 'Reported as not fixed — we will follow up.')
      reload()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Service requests</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!verified ? (
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-slate-500 flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> To raise or manage a service request, verify with the last 4 digits of your phone:</span>
            <Input className="w-28 tracking-widest" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
            <Button size="sm" className="h-10" disabled={last4.length !== 4} onClick={verify}>Verify</Button>
          </div>
        ) : !open ? (
          <Button size="sm" className="h-10" onClick={() => setOpen(true)}>Raise a service request</Button>
        ) : (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>What is wrong?</Label>
                <select className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="NO_POWER">System not generating</option>
                  <option value="FAULT_CODE">Inverter showing a fault code</option>
                  <option value="LOW_GENERATION">Generating less than expected</option>
                  <option value="DAMAGE">Physical damage</option>
                  <option value="OTHER">Something else</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Which equipment?</Label>
                <select className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value, faultCode: '' })}>
                  <option value="">Whole system / not sure</option>
                  {(faultData?.units ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.label} · SN {u.serial}</option>)}
                </select>
              </div>
            </div>
            {(faultData?.codes ?? []).filter((c: any) => !form.unitId || (faultData?.units ?? []).find((u: any) => u.id === form.unitId)?.model === c.model).length > 0 && (
              <div className="space-y-1.5">
                <Label>Fault code on the display (optional)</Label>
                <select className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={form.faultCode} onChange={(e) => setForm({ ...form, faultCode: e.target.value })}>
                  <option value="">No code / can't read it</option>
                  {(faultData?.codes ?? []).filter((c: any) => !form.unitId || (faultData?.units ?? []).find((u: any) => u.id === form.unitId)?.model === c.model).map((c: any) => (
                    <option key={`${c.model}-${c.code}`} value={c.code}>{c.code} — {c.description} ({c.model})</option>
                  ))}
                </select>
                {form.faultCode && <div className="text-xs text-slate-400">We prioritise the visit based on the fault code.</div>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Photos (optional, up to 4)</Label>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="text-sm" onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 4))} />
              {photos.length > 0 && <div className="text-xs text-slate-400">{photos.length} photo{photos.length > 1 ? 's' : ''} attached — they upload when you submit.</div>}
            </div>
            <div className="space-y-1.5">
              <Label>Describe the problem</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="For example: the inverter shows E02 since yesterday morning and the app says grid lost…" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" className="h-10" disabled={form.description.trim().length < 5 || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</Button>
            </div>
          </div>
        )}

        {tickets.length > 0 && (
          <div className="space-y-2">
            {tickets.map((t: any) => {
              const v = VERDICT_COPY[t.verdict]
              return (
                <div key={t.number} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium">{t.number} · {t.unit ?? 'System'}</div>
                    <span className={cn('text-xs font-medium rounded px-1.5 py-0.5',
                      t.status === 'CLOSED' ? 'bg-green-50 text-green-700' : t.status === 'RESOLVED' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
                      {t.status === 'RESOLVED' ? 'fixed — awaiting your confirmation' : t.status.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">{t.description}</div>
                  {t.photos?.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {t.photos.map((ph: any) => (
                        <a key={ph.id} href={ph.url} target="_blank" rel="noopener" title="Open full-size photo">
                          <PhotoThumb url={ph.url} label={ph.kind.toLowerCase()} />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                    <span className={cn('rounded px-1.5 py-0.5 border', v?.tone === 'done' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>{v?.label}</span>
                    <span>{t.billingMode === 'WARRANTY' ? 'no charge' : 'chargeable'}</span>
                    <span>·</span><span><Clock className="inline h-3 w-3 mb-0.5" /> priority {t.priority.toLowerCase()}</span>
                  </div>
                  {t.status === 'RESOLVED' && (
                    <div className="flex gap-2">
                      <Button size="sm" className="h-10" onClick={() => act(t.number, 'CONFIRM')}>It works — confirm</Button>
                      <Button size="sm" variant="outline" className="h-10" onClick={() => act(t.number, 'REOPEN')}>Not fixed</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {tickets.length === 0 && verified && !open && <EmptyState title="No service requests — enjoy the sun!" hint="Everything working? That is the plan. Raise a request here any time something looks wrong." />}
      </CardContent>
    </Card>
  )
}

function RequestFreshLink() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Clock className="h-5 w-5" /></div>
        <div className="text-sm font-semibold">Track your project</div>
        <p className="text-sm text-slate-500">Lost your My SunPower link? Enter your registered email address and we will send you a fresh one.</p>
        <div className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your registered email address"
            inputMode="email"
            aria-label="Registered email address"
          />
          <Button disabled={!isValidEmail || busy} onClick={async () => {
            setBusy(true)
            try {
              const r = await api('/public/portal-link-request', { method: 'POST', json: { email } })
              setMsg(r.message)
            } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
          }}>Send</Button>
        </div>
        {msg && <div className="text-sm text-green-700">{msg}</div>}
      </CardContent>
    </Card>
  )
}

// ── certificate view ──────────────────────────────────────────────

export function CertificateView({ token }: { token: string }) {
  const { data, loading, error } = useData(() => api(`/public/certificates/${token}`), [token])
  if (loading) return <Loading />
  if (error) return <Alert tone="warn" title="This certificate link is not valid">{error}</Alert>
  const c = data
  return (
    <div className="space-y-4">
      {c.viaPortal && (
        <div className="no-print"><a href={`#/p/${token}`} className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back to My SunPower</a></div>
      )}
      <div className="flex justify-between items-center no-print">
        <h1 className="text-xl font-semibold">Completion certificate</h1>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print / save PDF</Button>
      </div>
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="p-8 space-y-6">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <div className="flex items-center gap-2 font-semibold text-lg"><Sun className="h-6 w-6 text-amber-500" /> {c.company.name}</div>
              <div className="text-xs text-slate-500 mt-1">{c.company.address}</div>
              <div className="text-xs text-slate-500">GSTIN {c.company.gstin} · {c.company.phone}</div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="font-mono text-sm text-slate-800">{c.orderNumber}</div>
              <div>Issued {fmtDate(c.signedAt?.slice(0, 10) ?? '')}</div>
            </div>
          </div>
          <div>
            <h2 className="text-base font-semibold">Solar system installation certificate</h2>
            <p className="text-sm text-slate-600 mt-1">
              This certifies that a <strong>{c.capacityKw} kWp {c.systemType === 'ON_GRID' ? 'on-grid' : 'off-grid'} solar photovoltaic system</strong> was
              installed at <strong>{c.site}</strong> for <strong>{c.customerName}</strong>, completed on <strong>{fmtDate(c.finishedAt?.slice(0, 10) ?? '')}</strong>,
              and passed the generation test with a reading of <strong>{num(c.testReadingW)} W</strong>.
            </p>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Installed equipment (serial numbers)</div>
            <table className="w-full text-sm">
              <tbody>
                {c.units.map((u: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5">{u.product}</td>
                    <td className="py-1.5 font-mono text-xs">{u.serial}</td>
                    <td className="py-1.5 text-right text-slate-500">warranty until {u.warrantyEnd ? fmtDate(u.warrantyEnd) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 pt-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer signature</div>
              <div className="mt-1 border-b pb-1 text-sm">{c.signedName}</div>
              <div className="text-xs text-slate-400 mt-1">Signed electronically on {fmtDate(c.signedAt?.slice(0, 10) ?? '')}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">For SunPower Solar Energy</div>
              <div className="mt-1 border-b pb-1 text-sm">{c.crew.join(', ')}</div>
              <div className="text-xs text-slate-400 mt-1">Installation crew</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 break-all border-t pt-3">
            Proof hash (SHA-256 of job, name, time, capacity, serials and signature): {c.signoffHash}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── S24: public warranty page (QR) ────────────────────────────────

export function WarrantyPageView({ code }: { code: string }) {
  const { data, loading, error } = useData(() => api(`/public/warranty/${encodeURIComponent(code)}`), [code], { refetchOnFocus: true })
  if (loading) return <Loading />
  if (error) return <Alert tone="warn" title="No unit found for this code">{error}</Alert>
  const w = data.warranty
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <ShieldCheck className={cn('h-12 w-12 mx-auto', w && w.status === 'ACTIVE' ? 'text-green-600' : 'text-slate-400')} />
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-400">{data.brand ?? 'SunPower unit'}</div>
            <h1 className="text-xl font-semibold">{data.product}</h1>
            <div className="font-mono text-sm text-slate-500 mt-0.5">Serial {data.serial}</div>
          </div>
          {w ? (
            <div className={cn('rounded-lg border p-4 inline-block min-w-64', w.status === 'ACTIVE' ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50')}>
              <div className="text-sm font-semibold">{w.status === 'ACTIVE' ? 'Warranty active' : 'Warranty expired'}</div>
              <div className="text-sm text-slate-600 mt-1">{fmtDate(w.startDate)} → {fmtDate(w.endDate)}</div>
              <div className="text-2xl font-semibold mt-2 tabular-nums">{w.status === 'ACTIVE' ? `${num(w.daysLeft)} days left` : '—'}</div>
              <div className="text-xs text-slate-400 mt-1">{w.months} months coverage</div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No active warranty record for this unit. Contact SunPower support with this serial number.
            </div>
          )}
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            This public page shows equipment warranty status only — no customer details are ever shown here.
            For service, call +91 79 4000 1234 and quote this serial number.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
