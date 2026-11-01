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
import { Package, Printer, QrCode, AlertTriangle, Plus, ScanLine, ShoppingCart, Undo2, Download, ExternalLink, Camera, Eye } from 'lucide-react'
import QRCode from 'qrcode'
import { QrScannerModal } from './qr-scanner'

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
                    <div className="space-y-1"><Label>Unit cost (₹)</Label><Input type="number" value={l.unitCostRupees} onChange={(e) => setLine(i, { unitCostRupees: Number(e.target.value) })} /></div>
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
  const [productId, setProductId] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [qrSheetOpen, setQrSheetOpen] = useState(false)
  const [qrSheetData, setQrSheetData] = useState<Array<{ serial: string; qrCode: string; name: string; brand: string; status: string; dataUrl: string }>>([])
  const [sheetLoading, setSheetLoading] = useState(false)

  const { data: prodsData } = useData(() => api('/products'), [])
  const serializedProducts = (prodsData?.products ?? []).filter((p: any) => p.isSerialized)

  const queryParams = new URLSearchParams()
  if (status) queryParams.set('status', status)
  if (q) queryParams.set('q', q)
  if (productId) queryParams.set('productId', productId)
  queryParams.set('limit', '500')

  const { data, loading, reload } = useData(
    () => api(`/inventory/units?${queryParams.toString()}`),
    [q, status, productId]
  )
  const units = data?.units ?? []
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null)
  const [qrImg, setQrImg] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedUnit) {
      setQrImg(null)
      return
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    const targetUrl = `${origin}/#/w/${selectedUnit.qrCode}`
    QRCode.toDataURL(targetUrl, { width: 300, margin: 2 })
      .then((url) => setQrImg(url))
      .catch((err) => console.error('Failed to generate QR code', err))
  }, [selectedUnit])

  // Generate multi-unit QR sheet for quick testing/printing
  const openQrSheet = async () => {
    setQrSheetOpen(true)
    setSheetLoading(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      const sampleSlice = units.slice(0, 24)
      const list = await Promise.all(
        sampleSlice.map(async (u: any) => ({
          serial: u.serialNumber,
          qrCode: u.qrCode,
          name: u.product.name,
          brand: u.product.brand ?? 'SunPower',
          status: u.status,
          dataUrl: await QRCode.toDataURL(`${origin}/#/w/${u.qrCode}`, { width: 200, margin: 2 }),
        }))
      )
      setQrSheetData(list)
    } catch (e) {
      console.error(e)
    } finally {
      setSheetLoading(false)
    }
  }

  const downloadQr = () => {
    if (!qrImg || !selectedUnit) return
    const a = document.createElement('a')
    a.href = qrImg
    a.download = `QR-${selectedUnit.serialNumber}-${selectedUnit.qrCode}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success(`Downloaded QR code for ${selectedUnit.serialNumber}`)
  }

  const handleScan = (scanned: string) => {
    setQ(scanned)
    // find unit if present in loaded list
    const found = units.find((u: any) => u.qrCode === scanned || u.serialNumber === scanned)
    if (found) {
      setSelectedUnit(found)
      toast.success(`Found unit: ${found.serialNumber}`)
    } else {
      toast.info(`Scanned code: ${scanned}`)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Units & QR Codes"
        sub={`Tracking ${units.length} serialized units across solar panels, inverters, batteries and charge controllers`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => setScannerOpen(true)}
            >
              <Camera className="h-4 w-4" /> Scan QR
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-blue-700 hover:bg-blue-800 text-white"
              onClick={openQrSheet}
              disabled={units.length === 0}
            >
              <QrCode className="h-4 w-4" /> View QR Sheet ({Math.min(24, units.length)})
            </Button>
          </div>
        }
      />

      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="Search serial, QR code or product…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs text-sm"
        />

        {/* Product Dropdown Filter */}
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 max-w-[220px]"
        >
          <option value="">All Products ({serializedProducts.length})</option>
          {serializedProducts.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Status filters */}
        {['', 'IN_STOCK', 'INSTALLED', 'PICKED', 'DISPATCHED', 'DELIVERED', 'RMA'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              status === s
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            )}
          >
            {s === '' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? <Loading rows={6} /> : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">Serial &amp; QR</th>
              <th className="px-3 py-2.5 font-medium">Product &amp; Brand</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Delivered</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody>
              {units.slice(0, 150).map((u: any) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-xs font-semibold text-slate-900">{u.serialNumber}</div>
                    <div className="font-mono text-[11px] text-blue-600">QR: {u.qrCode}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{u.product.name}</div>
                    <div className="text-[11px] text-slate-400">{u.product.brand ?? '—'} · {u.product.category}</div>
                  </td>
                  <td className="px-3 py-2.5"><StageChip status={u.status} /></td>
                  <td className="px-3 py-2.5 text-slate-700">{u.customer?.name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{u.deliveredOn ? fmtDate(u.deliveredOn) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setSelectedUnit(u)}>
                        <QrCode className="h-3.5 w-3.5" /> View QR
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-500 hover:text-blue-700" onClick={() => (window.location.hash = `/w/${u.qrCode}`)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> /w/{u.qrCode}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {/* QR Scanner Dialog for Staff / Warehouse */}
      <QrScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
        title="Scan Serial / QR Label"
        description="Scan any printed equipment label, or test by pointing at an on-screen QR code."
      />

      {/* Multi-Unit Printable QR Testing Sheet */}
      <Dialog open={qrSheetOpen} onOpenChange={setQrSheetOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-blue-600" />
              Scannable QR Testing Sheet
            </DialogTitle>
            <DialogDescription>
              High-resolution scannable QR codes for testing camera scanning and mobile warranty checks.
            </DialogDescription>
          </DialogHeader>

          {sheetLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">Generating scannable QR codes…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
              {qrSheetData.map((item) => (
                <div key={item.serial} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col items-center text-center space-y-2 shadow-sm hover:border-blue-300 transition">
                  <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">{item.brand}</div>
                  <img src={item.dataUrl} alt={`QR for ${item.serial}`} className="w-28 h-28 object-contain border rounded-lg p-1 bg-white shadow-inner" />
                  <div className="w-full space-y-0.5">
                    <div className="text-xs font-semibold text-slate-800 line-clamp-1" title={item.name}>{item.name}</div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">SN: {item.serial}</div>
                    <div className="font-mono text-[10px] text-blue-600 font-medium">QR: {item.qrCode}</div>
                  </div>
                  <div className="flex gap-1 w-full pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] w-full"
                      onClick={() => {
                        const a = document.createElement('a')
                        a.href = item.dataUrl
                        a.download = `QR-${item.qrCode}.png`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        toast.success(`Downloaded ${item.qrCode}`)
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" /> PNG
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 text-[10px] w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        window.location.hash = `/w/${item.qrCode}`
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full border-t pt-3">
            <span className="text-xs text-slate-500">Showing {qrSheetData.length} scannable QR codes</span>
            <Button variant="outline" onClick={() => setQrSheetOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual QR Label Modal */}
      {selectedUnit && (
        <Dialog open={!!selectedUnit} onOpenChange={(open) => { if (!open) setSelectedUnit(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-blue-600" />
                Equipment QR Label
              </DialogTitle>
              <DialogDescription>
                Printable QR sticker and scannable code for serialized equipment.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col items-center text-center space-y-3 shadow-inner">
              {qrImg ? (
                <img
                  src={qrImg}
                  alt={`QR code for ${selectedUnit.serialNumber}`}
                  className="w-56 h-56 object-contain border border-slate-100 rounded-lg p-2 bg-white shadow-sm"
                />
              ) : (
                <div className="w-56 h-56 grid place-items-center bg-slate-100 rounded-lg text-xs text-slate-400">
                  Generating QR...
                </div>
              )}

              <div className="space-y-1 w-full">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{selectedUnit.product.brand ?? 'SunPower'}</div>
                <div className="text-sm font-semibold text-slate-900">{selectedUnit.product.name}</div>
                <div className="flex items-center justify-center gap-2 font-mono text-xs bg-slate-50 border rounded-md py-1 px-2 text-slate-700">
                  <span>SN: <strong>{selectedUnit.serialNumber}</strong></span>
                  <span>·</span>
                  <span>QR: <strong>{selectedUnit.qrCode}</strong></span>
                </div>
                <div className="text-[11px] text-slate-400 truncate pt-1">
                  URL: {typeof window !== 'undefined' ? `${window.location.origin}/#/w/${selectedUnit.qrCode}` : `/w/${selectedUnit.qrCode}`}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={downloadQr}>
                <Download className="h-4 w-4" /> Download QR PNG
              </Button>
              <Button className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                const code = selectedUnit.qrCode
                setSelectedUnit(null)
                window.location.hash = `/w/${code}`
              }}>
                <ExternalLink className="h-4 w-4" /> Open Warranty Page
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <div className="space-y-1"><Label>Unit cost (₹)</Label><Input type="number" value={l.unitCostRupees} onChange={(e) => setPoDraft({ ...poDraft, lines: poDraft.lines.map((x, j) => j === i ? { ...x, unitCostRupees: Number(e.target.value) } : x) })} /></div>
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
        <CardContent className="p-0 overflow-x-auto">
          {l2 ? <Loading rows={3} /> : (pos?.purchaseOrders ?? []).length === 0 ? <div className="p-4"><EmptyState title="No purchase orders" /></div> : (
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">PO</th><th className="px-3 py-2.5 font-medium">Supplier</th><th className="px-3 py-2.5 font-medium">Lines</th>
                <th className="px-3 py-2.5 font-medium text-right">Total</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium">Expected</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr></thead>
              <tbody>
                {(pos?.purchaseOrders ?? []).map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium">{p.poNumber}</td>
                    <td className="px-3 py-2.5">{p.supplier?.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{p.lines.map((l: any) => `${l.product?.name?.split(' ').slice(0, 3).join(' ')} ${l.qtyReceived}/${l.qtyOrdered}`).join(', ')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(p.totalPaise)}</td>
                    <td className="px-3 py-2.5"><StageChip status={p.status} /></td>
                    <td className="px-3 py-2.5 text-slate-500">{p.expectedOn ? fmtDate(p.expectedOn) : '—'}</td>
                    <td className="px-4 py-2.5 text-right">
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
