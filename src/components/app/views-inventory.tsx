// Inventory (S11, S12, S25): stock overview with on hand / reserved /
// available and a low-stock filter, receive stock with serial capture and a
// printable QR label sheet, suppliers and purchase orders, and the units
// browser that opens the public warranty page.

'use client'

import { useEffect, useState } from 'react'
import { api, money, fmtDate, num, useData, useMutation, nav } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Alert, EmptyState, Field, Loading, PageHeader, StageChip } from './shared'
import { Package, Printer, QrCode, AlertTriangle, Plus, ScanLine, ShoppingCart, Undo2 } from 'lucide-react'

// Draft-PO prefill handed from the stock view's low-stock action to Purchasing
// (module scope: survives the hash-route view switch; FR-5.8)
let draftPoPrefill: { productId: string; qty: number; unitCostRupees: number } | null = null

function queueDraftPoPrefill(pre: { productId: string; qty: number; unitCostRupees: number }) {
  draftPoPrefill = pre
}

function takeDraftPoPrefill() {
  const pre = draftPoPrefill
  draftPoPrefill = null
  return pre
}

// ── S11: stock overview ───────────────────────────────────────────

export function StockView() {
  const [lowOnly, setLowOnly] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const { data, loading, reload } = useData(() => api(`/inventory/stock${lowOnly ? '?low=1' : ''}`), [lowOnly])
  const rows = data?.stock ?? []
  const [adjusting, setAdjusting] = useState<any>(null)

  // low-stock → draft PO with the suggested shortfall quantity (FR-5.8)
  const draftPo = (r: any) => {
    queueDraftPoPrefill({
      productId: r.id,
      qty: Math.max(r.reorderLevel * 2 - r.available, 1),
      unitCostRupees: (r.stdCostPaise ?? 0) / 100,
    })
    nav('purchasing')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock"
        sub="On hand is physical; reserved belongs to confirmed orders; available = on hand − reserved"
        actions={
          <>
            <Button size="sm" variant={lowOnly ? 'default' : 'outline'} onClick={() => setLowOnly(!lowOnly)}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Low stock {lowOnly ? '(on)' : ''}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}><Undo2 className="h-3.5 w-3.5 mr-1" /> Record return</Button>
            <Button size="sm" onClick={() => nav('receive')}><Package className="h-3.5 w-3.5 mr-1" /> Receive stock</Button>
          </>
        }
      />
      {loading ? <Loading rows={6} /> : rows.length === 0 ? <EmptyState title="Everything is above its reorder level" /> : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">Product</th><th className="font-medium">Category</th>
              <th className="font-medium">Location</th>
              <th className="font-medium text-right">On hand</th><th className="font-medium text-right">Reserved</th>
              <th className="font-medium text-right">Available</th><th className="font-medium text-right">Reorder at</th>
              <th className="font-medium text-right">Avg cost</th><th className="font-medium text-right">Warranty</th>
              <th className="font-medium text-right">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={`${r.id}:${r.locationId ?? 'none'}`} className={cn('border-b last:border-0', r.low && 'bg-red-50/40')}>
                  <td className="px-4 py-2.5 font-medium">{r.name}<div className="text-[11px] text-slate-400 font-normal">{r.sku}{r.isSerialized ? ' · serialized' : ''}</div></td>
                  <td className="text-slate-500">{r.category.toLowerCase().replace(/_/g, ' ')}</td>
                  <td className="text-xs text-slate-500">{r.locationName ?? '—'}</td>
                  <td className="text-right tabular-nums">{num(r.onHand)}</td>
                  <td className="text-right tabular-nums text-slate-500">{num(r.reserved)}</td>
                  <td className={cn('text-right tabular-nums font-semibold', r.low && 'text-red-600')}>{num(r.available)}</td>
                  <td className="text-right tabular-nums text-slate-400">{num(r.reorderLevel)}</td>
                  <td className="text-right tabular-nums text-slate-500">{money(r.avgCostPaise)}</td>
                  <td className="text-right text-slate-500 text-xs">{r.warrantyMonths} mo · {r.warrantyStartBasis === 'DELIVERY' ? 'delivery' : 'sign-off'}</td>
                  <td className="pr-3 text-right">
                    {r.low && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => draftPo(r)}>
                        <ShoppingCart className="h-3 w-3 mr-1" /> Draft PO
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
      {rows.some((r: any) => r.low) && (
        <Alert tone="warn" title="Low stock alert">
          {rows.filter((r: any) => r.low).map((r: any) => r.name).join(', ')} below reorder level — the director and warehouse are emailed. Use Draft PO to start a purchase order pre-filled with the suggested quantity.
        </Alert>
      )}
      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} onDone={reload} />
    </div>
  )
}

// FR-5.7: compact return capture — raises on-hand stock and writes an audited
// RETURN movement with the reason.
function ReturnDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { data: productsData } = useData(() => (open ? api('/products') : Promise.resolve(null)), [open])
  const products = productsData?.products ?? []
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('')
  const [serial, setSerial] = useState('')
  const { busy, mutate } = useMutation()

  const product = products.find((p: any) => p.id === productId)

  const close = () => {
    setProductId(''); setQty(1); setReason(''); setSerial('')
    onOpenChange(false)
  }

  const submit = () => mutate(async () => {
    if (!productId) throw new Error('Choose the product being returned.')
    if (reason.trim().length < 3) throw new Error('A reason of at least 3 characters is required.')
    let unitId: string | undefined
    const code = serial.trim()
    if (code) {
      const found = await api(`/inventory/units?code=${encodeURIComponent(code)}`)
      if (!found?.unit) throw new Error(`No unit found for "${code}"`)
      unitId = found.unit.id
    }
    return api('/inventory/returns', { method: 'POST', json: { productId, qty: unitId ? 1 : qty, reason: reason.trim(), unitId } })
  }, { success: 'Return recorded — stock updated', onDone: () => { close(); onDone() } })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a return into stock</DialogTitle>
          <DialogDescription>Goods back on the warehouse shelf (site leftover, cancelled delivery, RMA in). On hand is raised and the reason is audited.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Product</Label>
            <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Choose product…</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {product?.isSerialized && (
            <div className="space-y-1">
              <Label>Serial or QR code (optional — puts the unit back in stock)</Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. INV3K-26A-000401" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Quantity</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1"><Label>Reason (required)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. site leftover from cancelled delivery" />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={close}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={submit}>Record return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── S12: receive stock ────────────────────────────────────────────

export function ReceiveView() {
  const { data: productsData } = useData(() => api('/products'), [])
  const { data: suppliersData } = useData(() => api('/suppliers'), [])
  const { data: poData } = useData(() => api('/purchase-orders'), [])
  const products = productsData?.products ?? []
  const [supplierName, setSupplierName] = useState('Adani Solar Distribution')
  const [poId, setPoId] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: number; unitCostRupees: number; serialNumbers: string[]; serialInput: string }[]>([])
  const [result, setResult] = useState<any>(null)
  const { busy, mutate } = useMutation()

  const addLine = () => setLines((ls) => [...ls, { productId: '', qty: 1, unitCostRupees: 1000, serialNumbers: [], serialInput: '' }])
  const setLine = (i: number, patch: Partial<typeof lines[0]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const receive = () => mutate(async () => {
    const r = await api('/inventory/receipts', {
      method: 'POST',
      json: {
        supplierName, poId: poId || null, supplierInvoiceRef: invoiceRef || undefined,
        lines: lines.map((l) => ({
          productId: l.productId, qty: l.qty, unitCostRupees: l.unitCostRupees,
          serialNumbers: products.find((p: any) => p.id === l.productId)?.isSerialized ? l.serialNumbers : undefined,
        })),
      },
    })
    return r
  }, { success: 'Stock received — units created and labels ready', onDone: (r) => setResult(r) })

  if (result) {
    return <ReceiptLabels receiptId={result.receipt.id} labels={result.labels} />
  }

  return (
    <div className="space-y-4">
      <PageHeader back={{ label: 'Stock', to: 'stock' }} title="Receive stock" sub="Serialized items create one unit per serial with a QR label" />
      <Card>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Supplier</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}>
                {(suppliersData?.suppliers ?? []).map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
                <option value="Other supplier">Other supplier</option>
              </select>
            </div>
            <div className="space-y-1"><Label>Against PO (optional)</Label>
              <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={poId} onChange={(e) => setPoId(e.target.value)}>
                <option value="">No PO (direct)</option>
                {(poData?.purchaseOrders ?? []).filter((p: any) => p.status === 'OPEN' || p.status === 'PARTIAL').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.poNumber} · {p.supplier.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1"><Label>Supplier invoice ref</Label><Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="e.g. ADI-88121" /></div>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => {
              const product = products.find((p: any) => p.id === l.productId)
              return (
                <div key={i} className="rounded-lg border p-3 space-y-3">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-1"><Label>Product</Label>
                      <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value, unitCostRupees: (products.find((p: any) => p.id === e.target.value)?.stdCostPaise ?? 100000) / 100 })}>
                        <option value="">Choose product…</option>
                        {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><Label>Qty</Label><Input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} disabled={product?.isSerialized && l.serialNumbers.length > 0} /></div>
                    <div className="space-y-1"><Label>Unit cost (Rs)</Label><Input type="number" value={l.unitCostRupees} onChange={(e) => setLine(i, { unitCostRupees: Number(e.target.value) })} /></div>
                  </div>
                  {product?.isSerialized && (
                    <div className="space-y-1.5">
                      <Label>Serial numbers — scan or paste, one per line ({l.serialNumbers.length}/{l.qty})</Label>
                      <Textarea
                        rows={2}
                        value={l.serialInput}
                        onChange={(e) => setLine(i, { serialInput: e.target.value })}
                        onBlur={() => {
                          const parts = l.serialInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
                          setLine(i, { serialNumbers: parts, serialInput: parts.join('\n') })
                        }}
                        placeholder={'INV3K-26A-000401\nINV3K-26A-000402'}
                      />
                      {l.serialNumbers.length > 0 && <div className="text-xs text-slate-500">{l.serialNumbers.length} serial(s) captured — a QR label is printed per unit</div>}
                      {l.serialNumbers.length !== l.qty && <div className="text-xs text-amber-700">Enter exactly {l.qty} serial numbers for this serialized item.</div>}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove line</Button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between">
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add product</Button>
            <Button size="sm" disabled={busy || lines.length === 0 || lines.some((l) => !l.productId)} onClick={receive}>Save and print labels</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReceiptLabels({ receiptId, labels }: { receiptId: string; labels: any[] }) {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ label: 'Receive stock', to: 'receive' }}
        title="QR labels"
        sub={`${labels.length} serialized units — each QR opens the public warranty page`}
        actions={<Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print label sheet</Button>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {labels.map((l: any) => (
          <Card key={l.serial} className="print:break-inside-avoid">
            <CardContent className="p-3 text-center">
              <img src={l.qrDataUrl} alt={`QR for ${l.serial}`} className="w-32 h-32 mx-auto" />
              <div className="text-xs font-semibold mt-2 truncate">{l.product}</div>
              <div className="font-mono text-[11px] text-slate-500">{l.serial}</div>
              <div className="font-mono text-[10px] text-slate-400 mt-0.5">{l.qr}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── units browser ─────────────────────────────────────────────────

export function UnitsView() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const { data, loading } = useData(() => api(`/inventory/units${status ? `?status=${status}` : ''}${q ? `${status ? '&' : '?'}q=${encodeURIComponent(q)}` : ''}`), [q, status])
  const units = data?.units ?? []
  return (
    <div className="space-y-4">
      <PageHeader title="Units" sub="One row per serialized unit; the QR opens the public warranty page" />
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search serial or QR code…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {['', 'IN_STOCK', 'PICKED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RMA', 'REPLACED'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', status === s ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500')}>
            {s === '' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>
      {loading ? <Loading rows={6} /> : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">Serial</th><th className="font-medium">Product</th><th className="font-medium">Status</th>
              <th className="font-medium">Customer</th><th className="font-medium">Delivered</th><th className="font-medium text-right">Warranty page</th>
            </tr></thead>
            <tbody>
              {units.slice(0, 100).map((u: any) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{u.serialNumber}</td>
                  <td>{u.product.name}</td>
                  <td><StageChip status={u.status} /></td>
                  <td>{u.customer?.name ?? '—'}</td>
                  <td className="text-slate-500">{u.deliveredOn ? fmtDate(u.deliveredOn) : '—'}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => (window.location.hash = `/w/${u.qrCode}`)}>
                      <QrCode className="h-3.5 w-3.5 mr-1" /> /w/{u.qrCode}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  )
}

// ── S25: purchasing ───────────────────────────────────────────────

export function PurchasingView() {
  const { data: suppliers, loading: l1, reload: r1 } = useData(() => api('/suppliers'), [])
  const { data: pos, loading: l2, reload: r2 } = useData(() => api('/purchase-orders'), [])
  const [newSupplier, setNewSupplier] = useState('')
  // a low-stock "Draft PO" from the stock view lands here pre-filled (FR-5.8);
  // supplier falls back to the first one at render/submit until chosen
  const [poDraft, setPoDraft] = useState<{ supplierId: string; lines: { productId: string; qty: number; unitCostRupees: number }[] } | null>(() => {
    const pre = takeDraftPoPrefill()
    if (!pre) return null
    return { supplierId: '', lines: [{ productId: pre.productId, qty: pre.qty, unitCostRupees: pre.unitCostRupees }] }
  })
  const { data: productsData } = useData(() => api('/products'), [])
  const { busy, mutate } = useMutation()
  const firstSupplierId = suppliers?.suppliers?.[0]?.id ?? ''

  const createPo = () => poDraft && mutate(() => api('/purchase-orders', {
    method: 'POST',
    json: { supplierId: poDraft.supplierId || firstSupplierId, lines: poDraft.lines },
  }), {
    success: 'Purchase order created',
    onDone: () => { setPoDraft(null); r2() },
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchasing"
        sub="Suppliers and purchase orders; receipts can link back to a PO line"
        actions={<Button size="sm" onClick={() => setPoDraft({ supplierId: suppliers?.suppliers?.[0]?.id ?? '', lines: [] })}><Plus className="h-3.5 w-3.5 mr-1" /> New PO</Button>}
      />

      {poDraft && (
        <Card className="border-blue-200">
          <CardHeader className="pb-2"><CardTitle className="text-base">Draft purchase order</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Supplier</Label>
                <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={poDraft.supplierId || firstSupplierId} onChange={(e) => setPoDraft({ ...poDraft, supplierId: e.target.value })}>
                  {(suppliers?.suppliers ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {poDraft.lines.map((l, i) => (
              <div key={i} className="grid sm:grid-cols-3 gap-3 items-end">
                <div className="space-y-1 sm:col-span-1">
                  <Label>Product</Label>
                  <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={l.productId}
                    onChange={(e) => setPoDraft({ ...poDraft, lines: poDraft.lines.map((x, j) => j === i ? { ...x, productId: e.target.value, unitCostRupees: (productsData?.products?.find((p: any) => p.id === e.target.value)?.stdCostPaise ?? 100000) / 100 } : x) })}>
                    <option value="">Choose…</option>
                    {(productsData?.products ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>Qty</Label><Input type="number" value={l.qty} onChange={(e) => setPoDraft({ ...poDraft, lines: poDraft.lines.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x) })} /></div>
                <div className="space-y-1"><Label>Unit cost (Rs)</Label><Input type="number" value={l.unitCostRupees} onChange={(e) => setPoDraft({ ...poDraft, lines: poDraft.lines.map((x, j) => j === i ? { ...x, unitCostRupees: Number(e.target.value) } : x) })} /></div>
              </div>
            ))}
            <div className="flex justify-between">
              <Button size="sm" variant="ghost" onClick={() => setPoDraft({ ...poDraft, lines: [...poDraft.lines, { productId: '', qty: 1, unitCostRupees: 1000 }] })}>+ Add line</Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPoDraft(null)}>Cancel</Button>
                <Button size="sm" disabled={busy || poDraft.lines.length === 0 || poDraft.lines.some((l) => !l.productId)} onClick={createPo}>Create PO</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Purchase orders</CardTitle></CardHeader>
        <CardContent className="p-0">
          {l2 ? <Loading rows={3} /> : (pos?.purchaseOrders ?? []).length === 0 ? <div className="p-4"><EmptyState title="No purchase orders" /></div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">PO</th><th className="font-medium">Supplier</th><th className="font-medium">Lines</th>
                <th className="font-medium text-right">Total</th><th className="font-medium">Status</th><th className="font-medium">Expected</th>
                <th className="font-medium text-right">Actions</th>
              </tr></thead>
              <tbody>
                {(pos?.purchaseOrders ?? []).map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.poNumber}</td>
                    <td>{p.supplier?.name}</td>
                    <td className="text-slate-500">{p.lines.map((l: any) => `${l.product?.name?.split(' ').slice(0, 3).join(' ')} ${l.qtyReceived}/${l.qtyOrdered}`).join(', ')}</td>
                    <td className="text-right tabular-nums">{money(p.totalPaise)}</td>
                    <td><StageChip status={p.status} /></td>
                    <td className="text-slate-500">{p.expectedOn ? fmtDate(p.expectedOn) : '—'}</td>
                    <td className="pr-3 text-right">
                      {['OPEN', 'PARTIAL'].includes(p.status) && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-700 border-red-200 hover:bg-red-50" disabled={busy}
                          onClick={() => {
                            const reason = window.prompt(`Cancel ${p.poNumber} — reason (required):`)
                            if (reason) void mutate(() => api(`/purchase-orders/${p.id}/cancel`, { method: 'POST', json: { reason } }), { success: 'Purchase order cancelled', onDone: r2 })
                          }}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Suppliers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {l1 ? <Loading rows={2} /> : (suppliers?.suppliers ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-slate-400">{s.contact} · {s.phone} · GSTIN {s.gstin}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="New supplier name" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} className="max-w-xs" />
            <Button size="sm" variant="outline" disabled={!newSupplier || busy} onClick={() => mutate(() => api('/suppliers', { method: 'POST', json: { name: newSupplier } }), { success: 'Supplier added', onDone: () => { setNewSupplier(''); r1() } })}>Add supplier</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
