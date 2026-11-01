// Dispatch (S13): the pick-and-scan screen. Camera-style scanner input with
// clear spoken-language rejections, a pick list with per-line progress, manual
// serial entry for damaged labels, departure locked until every line is
// complete, and on-site delivery confirmation that starts warranties.

'use client'

import { useEffect, useRef, useState } from 'react'
import { api, money, num, useData, useMutation, nav, uuid, useHashRoute } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, EmptyState, Field, Loading, PageHeader, StageChip, SerialBadge } from './shared'
import { ScanLine, Truck, PackageCheck, CheckCircle2, XCircle, ArrowRight, Undo2, MapPin } from 'lucide-react'

export function DispatchQueueView() {
  const { data, loading } = useData(() => api('/dispatches'), [])
  const dispatches = data?.dispatches ?? []
  return (
    <div className="space-y-4">
      <PageHeader title="Dispatch queue" sub="Every serial is scanned before the truck leaves (C6)" />
      {loading ? <Loading rows={3} /> : dispatches.length === 0 ? <EmptyState title="No dispatches waiting" hint="Confirmed orders create a dispatch automatically." /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {dispatches.map((d: any) => {
            const totalRequired = d.lines.reduce((s: number, l: any) => s + l.qtyRequired, 0)
            const totalLoaded = d.lines.reduce((s: number, l: any) => s + l.qtyLoaded, 0)
            const complete = d.lines.every((l: any) => l.qtyLoaded >= l.qtyRequired)
            return (
              <Card key={d.id} className={cn(complete && d.status === 'READY' && 'border-green-300')}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{d.dispatchNumber}</div>
                      <div className="text-xs text-slate-400">{d.order.orderNumber} · {d.order.customer.name}</div>
                    </div>
                    <StageChip status={d.status} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Pick progress</span><span>{num(totalLoaded)} / {num(totalRequired)} units</span>
                    </div>
                    <Progress value={(totalLoaded / Math.max(1, totalRequired)) * 100} />
                  </div>
                  <div className="text-xs text-slate-500">{d.order.capacityKw} kW {d.order.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} · {d.order.customer.addressLine}</div>
                  <Button className="w-full" size="sm" variant={complete ? 'default' : 'outline'} onClick={() => nav(`dispatch/${d.id}`)}>
                    <ScanLine className="h-3.5 w-3.5 mr-1" /> {d.status === 'PICKING' ? 'Pick and scan' : d.status === 'READY' ? 'Mark departed' : 'In transit — deliver'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PickScanView() {
  const [routeParts] = useHashRoute()
  const id = routeParts[1] ?? ''
  {
    const { data, loading, error, reload } = useData(() => api(`/dispatches/${id}`), [id])
    const [code, setCode] = useState('')
    const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
    const [flashMsg, setFlashMsg] = useState('')
    const { busy, mutate } = useMutation()
    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
      inputRef.current?.focus()
    }, [])

    if (loading) return <Loading rows={4} />
    if (error) return <Alert tone="warn" title="Dispatch not found">{error}</Alert>

    const d = data.dispatch
    const totalRequired = d.lines.reduce((s: number, l: any) => s + l.qtyRequired, 0)
    const totalLoaded = d.lines.reduce((s: number, l: any) => s + l.qtyLoaded, 0)
    const complete = d.lines.every((l: any) => l.qtyLoaded >= l.qtyRequired)

    const doScan = async (manual = false) => {
      const trimmed = code.trim()
      if (!trimmed) return
      try {
        const r = await api(`/dispatches/${id}/scan`, {
          method: 'POST',
          json: { code: trimmed, method: manual ? 'MANUAL' : 'QR', idempotencyKey: uuid() },
        })
        setFlash('ok')
        setFlashMsg(`${r.unit.product} · serial ${r.unit.serialNumber} — ${r.line.loaded} of ${r.line.required} on this line${r.dispatch.complete ? ' · pick list complete!' : ''}`)
        setCode('')
        reload()
      } catch (e: any) {
        setFlash('bad')
        setFlashMsg(e.message)
      } finally {
        setTimeout(() => setFlash(null), 3500)
      }
    }

    return (
      <div className="space-y-5 max-w-3xl">
        <PageHeader
          back={{ label: 'Dispatch', to: 'dispatch' }}
          title={`${d.dispatchNumber} · ${d.order.orderNumber}`}
          sub={`${d.order.customer.name} · ${d.order.capacityKw} kW ${d.order.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} · ${d.order.customer.addressLine}, ${d.order.customer.city}`}
          actions={<StageChip status={d.status} />}
        />

        {/* scanner */}
        {d.status === 'PICKING' && (
          <Card className={cn('border-2 transition-colors', flash === 'ok' && 'border-green-500 bg-green-50/60', flash === 'bad' && 'border-red-400 bg-red-50/60')}>
            <CardContent className="p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2"><ScanLine className="h-4 w-4" /> Scan a serial, QR code or label link</div>
              <form onSubmit={(e) => { e.preventDefault(); void doScan(false) }} className="flex gap-2">
                <Input ref={inputRef} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. INV3K-26A-000305 or SP1A2B3C4D" className="font-mono text-base h-11" autoFocus />
                <Button type="submit" className="h-11 px-6">Scan</Button>
                <Button type="button" variant="outline" className="h-11" onClick={() => doScan(true)} title="For damaged labels — logged as manual entry">Manual</Button>
              </form>
              {flash && (
                <div className={cn('rounded-lg px-3 py-2 text-sm flex items-start gap-2', flash === 'ok' ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900')} role="status" aria-live="polite">
                  {flash === 'ok' ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  {flashMsg}
                </div>
              )}
              <p className="text-xs text-slate-400">A scanner types the label&apos;s full web link — just scan it, it is recognized automatically. A good scan ticks the line. A bad scan says exactly why: wrong product, already scanned, or not in stock.</p>
              <div className="text-xs text-slate-500">Try a wrong scan: type <code className="bg-slate-100 rounded px-1">BATLI-26A-000301</code> (battery is not on this pick list).</div>
            </CardContent>
          </Card>
        )}

        {/* pick list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pick list</CardTitle>
            <div className="text-xs text-slate-500">{num(totalLoaded)} of {num(totalRequired)} units ready</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.lines.map((l: any) => {
              const done = l.qtyLoaded >= l.qtyRequired
              return (
                <div key={l.id} className={cn('rounded-lg border p-3', done ? 'border-green-300 bg-green-50/40' : 'border-slate-200')}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {done ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <PackageCheck className="h-4 w-4 text-slate-300 shrink-0" />}
                        {l.product.name}
                        {l.product.isSerialized && <span className="text-[10px] text-blue-700 bg-blue-50 rounded px-1 py-0.5">scan each unit</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{num(l.qtyLoaded)} of {num(l.qtyRequired)} {l.product.uom.toLowerCase()}{l.product.isSerialized ? '' : ' — confirm quantity'}</div>
                    </div>
                    {!l.product.isSerialized && d.status === 'PICKING' && (
                      <NonSerialLoader lineId={l.id} dispatchId={id} required={l.qtyRequired} loaded={l.qtyLoaded} onDone={reload} />
                    )}
                  </div>
                  {l.units.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {l.units.map((u: any) => (
                        <span key={u.id} className="inline-flex items-center gap-1 rounded bg-white border border-slate-200 px-1.5 py-0.5 text-xs">
                          <SerialBadge serial={u.unit.serialNumber} onClick={() => (window.location.hash = `/w/${u.unit.qrCode}`)} />
                          {d.status === 'PICKING' && (
                            <button title="Unscan" className="text-slate-300 hover:text-red-500" onClick={() => mutate(() => api(`/dispatches/${id}/unscan`, { method: 'POST', json: { unitId: u.unitId } }), { success: 'Unit unscanned', onDone: reload })}>
                              <Undo2 className="h-3 w-3" />
                            </button>
                          )}
                          <span className="text-[9px] text-slate-300 uppercase">{u.method}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* depart / deliver */}
        {d.status === 'PICKING' && !complete && (
          <Alert tone="warn" title="Departure is locked until every line is complete">
            {num(totalRequired - totalLoaded)} unit(s) still to load. The guard runs in the service and again at the database level.
          </Alert>
        )}
        {d.status === 'READY' && (
          <Card className="border-green-300">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <Truck className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-semibold">Pick list complete — ready to depart</div>
                  <div className="text-xs text-slate-500">Departing reduces on-hand stock and moves units to the vehicle.</div>
                </div>
              </div>
              <Button disabled={busy} onClick={() => mutate(() => api(`/dispatches/${id}/depart`, { method: 'POST' }), { success: 'Departed — on-hand stock reduced', onDone: reload })}>
                <Truck className="h-4 w-4 mr-1.5" /> Mark departed
              </Button>
            </CardContent>
          </Card>
        )}
        {d.status === 'IN_TRANSIT' && (
          <Card className="border-blue-300">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-semibold">In transit — the crew lead confirms delivery on site</div>
                  <div className="text-xs text-slate-500">Delivery links every unit to the customer and starts warranties (2-year inverter/controller, 20-year panels).</div>
                </div>
              </div>
              <Button disabled={busy} onClick={() => mutate(async () => {
                const r = await api(`/dispatches/${id}/deliver`, { method: 'POST', json: { lat: 23.0225, lng: 72.5714 } })
                return r
              }, { success: 'Delivered — warranties activated', onDone: reload })}>
                <PackageCheck className="h-4 w-4 mr-1.5" /> Confirm delivery
              </Button>
            </CardContent>
          </Card>
        )}
        {d.status === 'DELIVERED' && d.order.installation && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <div className="font-semibold">Delivered {d.deliveredAt ? '' : ''}— move on to the installation</div>
                <div className="text-xs text-slate-500">Units are at the customer site; the job waits on the crew&apos;s Today list.</div>
              </div>
              <Button variant="outline" onClick={() => nav(`job/${d.order.installation.id}`)}>Open installation job <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
}

function NonSerialLoader({ dispatchId, lineId, required, loaded, onDone }: { dispatchId: string; lineId: string; required: number; loaded: number; onDone: () => void }) {
  const [qty, setQty] = useState(loaded || required)
  const { busy, mutate } = useMutation()
  return (
    <div className="flex items-center gap-2">
      <Input type="number" className="w-20 h-8" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      <Button size="sm" variant="outline" disabled={busy || qty > required} onClick={() => mutate(() => api(`/dispatches/${dispatchId}/load`, { method: 'POST', json: { lineId, qty } }), { success: 'Quantity confirmed', onDone })}>Confirm</Button>
    </div>
  )
}
