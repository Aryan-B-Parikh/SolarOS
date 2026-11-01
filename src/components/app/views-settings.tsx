// Settings hub (S21): business settings (incl. tariff, SLA hours, working
// calendar), users & roles admin (FR-9.1), product / template / BOM editing
// with warranty terms (FR-9.2) and the audit log viewer (FR-9.3), plus the
// notifications feed (outbox with delivery tracking).

'use client'

import { useState } from 'react'
import { api, money, num, useData, useMutation, relTime, pct, fmtDateTime } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Loading, PageHeader, StageChip, EmptyState } from './shared'
import {
  Save, Bell, RefreshCw, CheckCheck, MailX, Plus, Pencil, KeyRound, UserPlus,
  ChevronLeft, ChevronRight, Trash2, ScrollText, Mail,
} from 'lucide-react'

// ── shared vocabularies ───────────────────────────────────────────

const ROLES: [string, string][] = [
  ['DIRECTOR', 'Director'], ['SALES', 'Sales'], ['TECHNICIAN', 'Technician'],
  ['WAREHOUSE', 'Warehouse'], ['SUPPORT', 'Support'], ['ACCOUNTS', 'Accounts'],
]

const PRODUCT_CATEGORIES: [string, string][] = [
  ['PANEL', 'Panel'], ['INVERTER', 'Inverter'], ['BATTERY', 'Battery'], ['CHARGE_CONTROLLER', 'Charge controller'],
  ['MOUNTING', 'Mounting'], ['CABLE', 'Cable'], ['ACDB', 'ACDB'], ['DCDB', 'DCDB'],
  ['EARTHING', 'Earthing'], ['LIGHTNING_ARRESTER', 'Lightning arrester'], ['CONNECTOR', 'Connector'], ['SERVICE', 'Service'],
]

const BOM_RULES: [string, string][] = [
  ['FIXED', 'Fixed qty'],
  ['PANEL_COUNT', 'Panel count'],
  ['PER_PANEL', 'Per panel ×'],
  ['PER_KW', 'Per kW ×'],
  ['PER_CABLE_METER', 'Per cable m ×'],
]

// businessDays use the 0=Sun…6=Sat convention (matches lib/settings)
const WEEK_DAYS: [number, string][] = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun'],
]

const AUDIT_ENTITIES = [
  'user', 'product', 'template', 'settings', 'expense', 'lead', 'quote', 'order',
  'payment', 'installation', 'dispatch', 'ticket', 'survey', 'stock', 'purchase_order', 'purchase_receipt',
]

function categoryLabel(c: string): string {
  return PRODUCT_CATEGORIES.find(([k]) => k === c)?.[1] ?? c.replace(/_/g, ' ').toLowerCase()
}

// ── settings shell (role-gated: S21 + FR-9.1/9.2/9.3) ─────────────

export function SettingsView() {
  const { data: meData, loading, error } = useData(() => api('/auth/me'), [])
  if (loading) return <Loading rows={4} />
  if (!meData?.user) return <EmptyState title={error ?? 'Please sign in to continue.'} />
  const role: string = meData.user.role
  const isDirector = role === 'DIRECTOR'
  const isAccounts = role === 'ACCOUNTS'

  if (!isDirector && !isAccounts) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" sub="Business settings live in the database — the director can change them without a deploy" />
        <EmptyState title="You don't have access to settings." hint="Settings are managed by the director. Accounts can review the audit log here." />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        sub={isDirector
          ? 'Business settings, catalogue, templates and user accounts — changes are audited'
          : 'Audit trail — every who-did-what in the system, latest first'}
      />
      <Tabs defaultValue={isDirector ? 'business' : 'audit'}>
        <TabsList className="h-auto flex-wrap justify-start">
          {isDirector && (
            <>
              <TabsTrigger value="business">Business</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="templates">Templates &amp; BOM</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
            </>
          )}
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        {isDirector && (
          <>
            <TabsContent value="business"><BusinessTab /></TabsContent>
            <TabsContent value="products"><ProductsTab /></TabsContent>
            <TabsContent value="templates"><TemplatesTab /></TabsContent>
            <TabsContent value="users"><UsersTab /></TabsContent>
          </>
        )}
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ── business settings (S21 + FR-9.2 tariff/SLA/hours) ─────────────

function BusinessTab() {
  const { data, loading, reload } = useData(() => api('/settings'), [])
  const [form, setForm] = useState<any>(null)
  const { busy, mutate } = useMutation()

  if (loading || !data) return <Loading rows={4} />
  const s = form ?? data.settings
  const set = (k: string, v: unknown) => setForm({ ...s, [k]: v })
  const setSla = (k: string, v: string) => setForm({ ...s, slaHoursByPriority: { ...s.slaHoursByPriority, [k]: Number(v) || 0 } })
  const toggleDay = (d: number) => {
    const days: number[] = s.businessDays ?? []
    setForm({ ...s, businessDays: days.includes(d) ? days.filter((x: number) => x !== d) : [...days, d].sort((a, b) => a - b) })
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Company name</Label><Input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} /></div>
          <div className="space-y-1"><Label>GSTIN</Label><Input value={s.gstin} onChange={(e) => set('gstin', e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Address</Label><Input value={s.address} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="space-y-1"><Label>Bank details (quote footer)</Label><Input value={s.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={s.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        </div>

        <div className="grid sm:grid-cols-4 gap-4">
          <div className="space-y-1"><Label>Advance %</Label><Input type="number" value={s.advancePct} onChange={(e) => set('advancePct', Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Target margin %</Label><Input type="number" value={s.targetMarginBp / 100} onChange={(e) => set('targetMarginBp', Number(e.target.value) * 100)} /></div>
          <div className="space-y-1"><Label>Sales discount limit %</Label><Input type="number" value={s.salesDiscountLimitBp / 100} onChange={(e) => set('salesDiscountLimitBp', Number(e.target.value) * 100)} /></div>
          <div className="space-y-1"><Label>Quote validity (days)</Label><Input type="number" value={s.quoteValidityDays} onChange={(e) => set('quoteValidityDays', Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Yield kWh/kWp/day</Label><Input type="number" step="0.1" value={s.yieldKwhPerKwpPerDay} onChange={(e) => set('yieldKwhPerKwpPerDay', Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Roof area per kW (m²)</Label><Input type="number" value={s.roofAreaPerKwSqm} onChange={(e) => set('roofAreaPerKwSqm', Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>AI summaries</Label>
            <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={String(s.aiEnabled)} onChange={(e) => set('aiEnabled', e.target.value === 'true')}>
              <option value="true">Enabled (with fallback)</option><option value="false">Disabled (templated)</option>
            </select>
          </div>
          <div className="space-y-1"><Label>Photo analysis</Label>
            <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={String(s.photoAnalysisEnabled)} onChange={(e) => set('photoAnalysisEnabled', e.target.value === 'true')}>
              <option value="true">Enabled (advisory)</option><option value="false">Disabled</option>
            </select>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Energy economics &amp; service SLA</div>
          <div className="grid sm:grid-cols-5 gap-4">
            <div className="space-y-1"><Label>Default tariff (Rs/kWh)</Label><Input type="number" step="0.1" value={s.defaultTariffPaise / 100} onChange={(e) => set('defaultTariffPaise', Math.round(Number(e.target.value) * 100) || 0)} /></div>
            <div className="space-y-1"><Label>SLA — Low (h)</Label><Input type="number" value={s.slaHoursByPriority.LOW} onChange={(e) => setSla('LOW', e.target.value)} /></div>
            <div className="space-y-1"><Label>SLA — Normal (h)</Label><Input type="number" value={s.slaHoursByPriority.NORMAL} onChange={(e) => setSla('NORMAL', e.target.value)} /></div>
            <div className="space-y-1"><Label>SLA — High (h)</Label><Input type="number" value={s.slaHoursByPriority.HIGH} onChange={(e) => setSla('HIGH', e.target.value)} /></div>
            <div className="space-y-1"><Label>SLA — Urgent (h)</Label><Input type="number" value={s.slaHoursByPriority.URGENT} onChange={(e) => setSla('URGENT', e.target.value)} /></div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Business hours (IST)</div>
          <div className="grid sm:grid-cols-4 gap-4">
            <div className="space-y-1"><Label>Day starts (hour 0–23)</Label><Input type="number" min={0} max={23} value={s.businessStartHour} onChange={(e) => set('businessStartHour', Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Day ends (hour 0–23)</Label><Input type="number" min={0} max={23} value={s.businessEndHour} onChange={(e) => set('businessEndHour', Number(e.target.value))} /></div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Working days</Label>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {WEEK_DAYS.map(([d, label]) => (
                  <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={(s.businessDays ?? []).includes(d)} onCheckedChange={() => toggleDay(d)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400">Used by lead SLA clocks, ticket priorities, savings estimates and the maintenance scheduler.</p>
          <Button size="sm" disabled={busy || !form} onClick={() => mutate(() => api('/settings', { method: 'PATCH', json: form }), { success: 'Settings saved', onDone: () => { reload(); setForm(null) } })}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── products & warranty terms (FR-9.2) ────────────────────────────

function ProductsTab() {
  const { data, loading, reload } = useData(() => api('/products'), [])
  const [editing, setEditing] = useState<any | null>(null)
  const products = data?.products ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Catalogue, pricing, warranty terms and reorder levels — every change is audited.</p>
        <Button size="sm" onClick={() => setEditing({})}><Plus className="h-3.5 w-3.5 mr-1" /> Add product</Button>
      </div>
      {loading ? <Loading rows={4} /> : (
        <Card><CardContent className="p-0">
          <div className="max-h-[560px] overflow-y-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10"><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Product</th><th className="font-medium">Category</th>
                <th className="font-medium">Warranty terms</th><th className="font-medium">Serialized</th>
                <th className="font-medium text-right">Cost</th><th className="font-medium text-right">Price</th>
                <th className="font-medium text-right">Tax</th><th className="font-medium text-right">Reorder</th>
                <th className="px-4 font-medium text-right">Edit</th>
              </tr></thead>
              <tbody>
                {products.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium">{p.name}<div className="text-[11px] text-slate-400">{p.sku}{p.brand ? ` · ${p.brand}` : ''}</div></td>
                    <td className="text-slate-500">{categoryLabel(p.category)}</td>
                    <td>{p.warrantyMonths} months<br /><span className="text-[11px] text-slate-400">from {p.warrantyStartBasis === 'DELIVERY' ? 'delivery' : 'sign-off'}</span></td>
                    <td>{p.isSerialized ? <StageChip label="serial tracked" tone="info" /> : <span className="text-slate-300">—</span>}</td>
                    <td className="text-right tabular-nums">{money(p.stdCostPaise)}</td>
                    <td className="text-right tabular-nums">{money(p.salePricePaise)}</td>
                    <td className="text-right tabular-nums text-slate-500">{pct(p.taxRateBp)}</td>
                    <td className="text-right tabular-nums text-slate-500">{num(p.reorderLevel)}</td>
                    <td className="px-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No products yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}
      {editing !== null && (
        <ProductDialog product={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
      )}
    </div>
  )
}

function ProductDialog({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: () => void }) {
  const isNew = !product
  const { busy, mutate } = useMutation()
  const [f, setF] = useState({
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    category: product?.category ?? 'PANEL',
    brand: product?.brand ?? '',
    isSerialized: product?.isSerialized ?? false,
    warrantyMonths: product?.warrantyMonths ?? 60,
    warrantyStartBasis: product?.warrantyStartBasis ?? 'DELIVERY',
    stdCostRupees: product ? product.stdCostPaise / 100 : 0,
    salePriceRupees: product ? product.salePricePaise / 100 : 0,
    taxRatePct: product ? product.taxRateBp / 100 : 18,
    reorderLevel: product?.reorderLevel ?? 0,
    monitoringUrl: product?.monitoringUrl ?? '',
  })
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })

  const payload = {
    name: f.name.trim(),
    category: f.category,
    brand: f.brand.trim() || null,
    isSerialized: f.isSerialized,
    warrantyMonths: Number(f.warrantyMonths) || 0,
    warrantyStartBasis: f.warrantyStartBasis,
    stdCostPaise: Math.round(Number(f.stdCostRupees) * 100) || 0,
    salePricePaise: Math.round(Number(f.salePriceRupees) * 100) || 0,
    taxRateBp: Math.round(Number(f.taxRatePct) * 100) || 0,
    reorderLevel: Number(f.reorderLevel) || 0,
    monitoringUrl: f.monitoringUrl.trim() || null,
    ...(isNew ? { sku: f.sku.trim().toUpperCase() } : {}),
  }

  const save = () => mutate(
    () => isNew
      ? api('/products', { method: 'POST', json: payload })
      : api(`/products/${product.id}`, { method: 'PATCH', json: payload }),
    { success: isNew ? 'Product created' : 'Product updated', onDone: onSaved },
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add product' : `Edit ${product.name}`}</DialogTitle>
          <DialogDescription>Prices are in rupees. Warranty terms drive service eligibility and reminders.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          {isNew && <div className="space-y-1"><Label>SKU</Label><Input value={f.sku} placeholder="PANEL-540" onChange={(e) => set('sku', e.target.value)} /></div>}
          <div className="space-y-1"><Label>Name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Category</Label>
            <Select value={f.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">{PRODUCT_CATEGORIES.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Brand</Label><Input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></div>
          <div className="space-y-1"><Label>Standard cost (Rs)</Label><Input type="number" step="0.01" value={f.stdCostRupees} onChange={(e) => set('stdCostRupees', e.target.value)} /></div>
          <div className="space-y-1"><Label>Sale price (Rs)</Label><Input type="number" step="0.01" value={f.salePriceRupees} onChange={(e) => set('salePriceRupees', e.target.value)} /></div>
          <div className="space-y-1"><Label>Tax rate %</Label><Input type="number" step="0.5" value={f.taxRatePct} onChange={(e) => set('taxRatePct', e.target.value)} /></div>
          <div className="space-y-1"><Label>Reorder level</Label><Input type="number" step="0.5" value={f.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Monitoring URL (optional)</Label><Input value={f.monitoringUrl} placeholder="https://monitor.example/site/…" onChange={(e) => set('monitoringUrl', e.target.value)} /></div>

          <div className="sm:col-span-2 border-t pt-3 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Warranty terms</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Warranty (months)</Label><Input type="number" min={0} max={360} value={f.warrantyMonths} onChange={(e) => set('warrantyMonths', e.target.value)} /></div>
              <div className="space-y-1"><Label>Warranty starts on</Label>
                <Select value={f.warrantyStartBasis} onValueChange={(v) => set('warrantyStartBasis', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DELIVERY">Delivery</SelectItem>
                    <SelectItem value="INSTALLATION_SIGNOFF">Installation sign-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={f.isSerialized} onCheckedChange={(v) => set('isSerialized', v)} />
              Serialized — tracked unit by unit with serial numbers / QR labels
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || f.name.trim().length < 2 || (isNew && f.sku.trim().length < 2)}>
            {busy ? 'Saving…' : 'Save product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── templates & BOM rules (FR-9.2) ────────────────────────────────

function TemplatesTab() {
  const { data, loading, reload } = useData(() => api('/templates?all=1'), [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const templates = data?.templates ?? []
  const editing = templates.find((t: any) => t.id === editingId)

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">System templates with their BOM quantity rules. Editing replaces the BOM lines and bumps the template version.</p>
      {loading ? <Loading rows={4} /> : templates.map((t: any) => (
        <Card key={t.id} className={cn(!t.isActive && 'opacity-60')}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">
                  {t.name} <span className="text-xs font-normal text-slate-400">{t.code} · v{t.version}</span>
                  {!t.isActive && <StageChip label="inactive" tone="warn" className="ml-2" />}
                </CardTitle>
                <div className="text-xs text-slate-500 mt-0.5">
                  {t.systemType.replace(/_/g, ' ').toLowerCase()} · {t.capacityKw} kW · labour allowance {money(t.labourAllowancePaise)} · default cable {t.defaultCableDistanceM} m
                  {t.panelProduct ? ` · panel ${t.panelProduct.name}` : ''}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditingId(t.id)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-400"><th className="px-4 py-1.5 font-medium">Product</th><th className="font-medium">Rule</th><th className="font-medium text-right">Value</th><th className="font-medium text-right">Allowance</th></tr></thead>
              <tbody>
                {t.bomLines.map((l: any) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5">{l.product.name}</td>
                    <td><span className="text-[10px] font-mono rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{l.rule}</span></td>
                    <td className="text-right tabular-nums">{num(l.value)}</td>
                    <td className="text-right tabular-nums text-slate-400">{num(l.allowance)}</td>
                  </tr>
                ))}
                {t.bomLines.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-400">No BOM lines yet.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
      {editing && (
        <TemplateDialog
          template={editing}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); reload() }}
        />
      )}
    </div>
  )
}

function TemplateDialog({ template, onClose, onSaved }: { template: any; onClose: () => void; onSaved: () => void }) {
  const { data: productsData } = useData(() => api('/products'), [])
  const products = productsData?.products ?? []
  const { busy, mutate } = useMutation()
  const [f, setF] = useState({
    name: template.name,
    isActive: template.isActive,
    defaultCableDistanceM: template.defaultCableDistanceM,
    labourAllowanceRupees: template.labourAllowancePaise / 100,
    priceOverrideRupees: template.priceOverridePaise != null ? String(template.priceOverridePaise / 100) : '',
  })
  const [lines, setLines] = useState<any[]>(
    [...(template.bomLines ?? [])]
      .map((l: any) => ({ productId: l.productId, rule: l.rule, value: l.value, allowance: l.allowance, sortOrder: l.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  )
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })
  const setLine = (i: number, patch: any) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines([...lines, { productId: products[0]?.id ?? '', rule: 'FIXED', value: 1, allowance: 0, sortOrder: lines.length }])
  const removeLine = (i: number) => setLines(lines.filter((_, j) => j !== i))

  const save = () => {
    if (lines.some((l) => !l.productId)) {
      toast.error('Pick a product for every BOM line.')
      return
    }
    const payload = {
      name: f.name.trim(),
      isActive: f.isActive,
      defaultCableDistanceM: Number(f.defaultCableDistanceM) || 0,
      labourAllowancePaise: Math.round(Number(f.labourAllowanceRupees) * 100) || 0,
      priceOverridePaise: f.priceOverrideRupees.trim() === '' ? null : Math.round(Number(f.priceOverrideRupees) * 100) || 0,
      lines: lines.map((l, i) => ({
        productId: l.productId, rule: l.rule, value: Number(l.value) || 0,
        allowance: Number(l.allowance) || 0, sortOrder: i,
      })),
    }
    mutate(() => api(`/templates/${template.id}`, { method: 'PATCH', json: payload }), { success: 'Template updated', onDone: onSaved })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>Edit template — {template.name} <span className="text-xs font-normal text-slate-400">{template.code}</span></DialogTitle>
          <DialogDescription>
            Quantity rules: fixed qty · panel count (capacity ÷ panel Wp) · per panel × · per kW × · per cable metre × + allowance.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Template name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Default cable distance (m)</Label><Input type="number" min={0} value={f.defaultCableDistanceM} onChange={(e) => set('defaultCableDistanceM', e.target.value)} /></div>
          <div className="space-y-1"><Label>Labour allowance (Rs)</Label><Input type="number" step="0.01" value={f.labourAllowanceRupees} onChange={(e) => set('labourAllowanceRupees', e.target.value)} /></div>
          <div className="space-y-1"><Label>Price override (Rs, blank = compute from BOM)</Label><Input type="number" step="0.01" value={f.priceOverrideRupees} onChange={(e) => set('priceOverrideRupees', e.target.value)} /></div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">BOM lines</div>
          <div className="max-h-72 overflow-y-auto scroll-thin rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">Product</th><th className="font-medium">Rule</th>
                <th className="font-medium text-right">Value</th><th className="font-medium text-right">Allowance</th>
                <th className="px-2"></th>
              </tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5 min-w-48">
                      <Select value={l.productId || undefined} onValueChange={(v) => setLine(i, { productId: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a product" /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="pr-3">
                      <Select value={l.rule} onValueChange={(v) => setLine(i, { rule: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{BOM_RULES.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="pr-3"><Input className="h-8 text-right text-xs" type="number" step="0.01" min={0} value={l.value} onChange={(e) => setLine(i, { value: e.target.value })} /></td>
                    <td className="pr-3"><Input className="h-8 text-right text-xs" type="number" step="0.1" min={0} value={l.allowance} onChange={(e) => setLine(i, { allowance: e.target.value })} /></td>
                    <td className="px-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" title="Remove line" onClick={() => removeLine(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No lines — add at least a panel and an inverter.</td></tr>}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={f.isActive} onCheckedChange={(v) => set('isActive', v)} />
          Active — offered when building quotes
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || f.name.trim().length < 2}>{busy ? 'Saving…' : 'Save template'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── users & roles (FR-9.1) ────────────────────────────────────────

function UsersTab() {
  const { data: meData } = useData(() => api('/auth/me'), [])
  const meId: string | undefined = meData?.user?.id
  const { data, loading, reload } = useData(() => api('/users'), [])
  const { busy, mutate } = useMutation()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [resetting, setResetting] = useState<any | null>(null)
  const users = data?.users ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Staff accounts and roles. Deactivating keeps every order, ticket and audit row — the person just can&apos;t sign in.</p>
        <Button size="sm" onClick={() => setCreating(true)}><UserPlus className="h-3.5 w-3.5 mr-1" /> Add user</Button>
      </div>
      {loading ? <Loading rows={4} /> : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 font-medium">User</th><th className="font-medium">Role</th>
              <th className="font-medium">Active</th><th className="font-medium">Last sign-in</th>
              <th className="px-4 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className={cn('border-b last:border-0', !u.isActive && 'opacity-60')}>
                  <td className="px-4 py-2.5 font-medium">
                    {u.name}
                    <div className="text-[11px] text-slate-400">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div>
                  </td>
                  <td><span className="text-xs font-medium rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-slate-600">{ROLES.find(([k]) => k === u.role)?.[1] ?? u.role}</span></td>
                  <td>
                    <Switch
                      checked={u.isActive}
                      disabled={busy || u.id === meId}
                      title={u.id === meId ? 'You cannot deactivate your own account' : undefined}
                      onCheckedChange={(v) => mutate(
                        () => api(`/users/${u.id}`, { method: 'PATCH', json: { isActive: v } }),
                        { success: v ? 'User activated' : 'User deactivated — history preserved', onDone: reload },
                      )}
                    />
                  </td>
                  <td className="text-xs text-slate-500">{u.lastLoginAt ? relTime(u.lastLoginAt) : 'never'}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={`Reset password for ${u.name}`} onClick={() => setResetting(u)}>
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No users yet.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      )}
      {creating && <UserDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} />}
      {editing && <UserDialog user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  )
}

function UserDialog({ user, onClose, onSaved }: { user?: any; onClose: () => void; onSaved: () => void }) {
  const isNew = !user
  const { busy, mutate } = useMutation()
  const [f, setF] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: user?.role ?? 'SALES',
    password: '',
  })
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })
  const passwordOk = f.password.length >= 8 || (!isNew && f.password === '')

  const save = () => {
    if (isNew) {
      mutate(() => api('/users', {
        method: 'POST',
        json: { name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim() || null, role: f.role, password: f.password },
      }), { success: 'User created', onDone: onSaved })
    } else {
      mutate(() => api(`/users/${user.id}`, {
        method: 'PATCH',
        json: {
          name: f.name.trim(), phone: f.phone.trim() || null, role: f.role,
          ...(f.password ? { password: f.password } : {}),
        },
      }), { success: f.password ? 'User updated — password reset' : 'User updated', onDone: onSaved })
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add user' : `Edit ${user.name}`}</DialogTitle>
          <DialogDescription>{isNew ? 'The person can sign in immediately with the chosen password.' : 'Leave the password blank to keep the current one.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Full name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          {isNew && <div className="space-y-1"><Label>Email (sign-in id)</Label><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>}
          <div className="space-y-1"><Label>Phone (optional)</Label><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="space-y-1"><Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => set('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isNew ? 'Password (min 8 characters)' : 'New password (optional)'}</Label>
            <Input type="password" value={f.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || f.name.trim().length < 2 || !passwordOk || (isNew && (f.email.trim().length < 5 || f.password.length < 8))}>
            {busy ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const { busy, mutate } = useMutation()
  const save = () => mutate(
    () => api(`/users/${user.id}`, { method: 'PATCH', json: { password } }),
    { success: `Password reset for ${user.name}`, onDone: onClose },
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-400" /> Reset password</DialogTitle>
          <DialogDescription>{user.name} · {user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>New password (min 8 characters)</Label>
          <Input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || password.length < 8} onClick={save}>{busy ? 'Resetting…' : 'Reset password'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── audit log viewer (FR-9.3) ─────────────────────────────────────

function AuditTab() {
  const [entity, setEntity] = useState('all')
  const [action, setAction] = useState('')
  const [entityId, setEntityId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const qs = new URLSearchParams()
  if (entity && entity !== 'all') qs.set('entity', entity)
  if (action.trim()) qs.set('action', action.trim())
  if (entityId.trim()) qs.set('entityId', entityId.trim())
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  qs.set('page', String(page))

  const { data, loading } = useData(() => api(`/audit?${qs.toString()}`), [qs.toString()])
  const entries = data?.entries ?? []
  const resetPage = (apply: () => void) => { apply(); setPage(1) }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="space-y-1"><Label className="text-[11px]">Entity</Label>
            <Select value={entity} onValueChange={(v) => resetPage(() => setEntity(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All entities</SelectItem>
                {AUDIT_ENTITIES.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-[11px]">Action</Label>
            <Input className="h-8 text-xs" placeholder="e.g. USER_UPDATE" value={action} onChange={(e) => resetPage(() => setAction(e.target.value))} />
          </div>
          <div className="space-y-1"><Label className="text-[11px]">Entity id</Label>
            <Input className="h-8 text-xs font-mono" placeholder="uuid…" value={entityId} onChange={(e) => resetPage(() => setEntityId(e.target.value))} />
          </div>
          <div className="space-y-1"><Label className="text-[11px]">From</Label>
            <Input className="h-8 text-xs" type="date" value={from} onChange={(e) => resetPage(() => setFrom(e.target.value))} />
          </div>
          <div className="space-y-1"><Label className="text-[11px]">To</Label>
            <Input className="h-8 text-xs" type="date" value={to} onChange={(e) => resetPage(() => setTo(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" className="w-full h-8" onClick={() => { setEntity('all'); setAction(''); setEntityId(''); setFrom(''); setTo(''); setPage(1) }}>
              <RefreshCw className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </div>

        {loading && !data ? <Loading rows={6} /> : entries.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No audit entries match" hint="Try widening the filters." />
        ) : (
          <div className="max-h-[520px] overflow-y-auto scroll-thin rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10"><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">When</th><th className="font-medium">Actor</th>
                <th className="font-medium">Entity</th><th className="font-medium">Action</th><th className="pr-3 font-medium">Changes</th>
              </tr></thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 align-top hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                    <td className="py-2 text-xs whitespace-nowrap">
                      <span className="font-medium">{e.actorName}</span>
                      <div className="text-[10px] text-slate-400">{e.actorType.toLowerCase()}</div>
                    </td>
                    <td className="py-2 text-xs"><StageChip label={e.entityType.replace(/_/g, ' ')} tone="neutral" /></td>
                    <td className="py-2"><code className="text-[10px] font-mono rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{e.action}</code></td>
                    <td className="pr-3 py-2"><AuditChanges before={e.before} after={e.after} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-slate-500">
          <span>{data ? `${num(data.total)} ${data.total === 1 ? 'entry' : 'entries'} · page ${data.page} of ${data.pageCount}` : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data || data.page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={!data || data.page >= data.pageCount || loading} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AuditChanges({ before, after }: { before: unknown; after: unknown }) {
  const fmt = (v: unknown) => (v === null || v === undefined ? '' : JSON.stringify(v))
  const b = fmt(before)
  const a = fmt(after)
  if (!b && !a) return <span className="text-slate-300 text-xs">—</span>
  return (
    <div className="space-y-0.5 max-w-[420px]">
      {b && <div className="text-[11px] text-slate-400 font-mono truncate" title={b}>− {b}</div>}
      {a && <div className="text-[11px] text-slate-700 font-mono truncate" title={a}>+ {a}</div>}
    </div>
  )
}

// ── notifications (outbox feed) ───────────────────────────────────

const TEMPLATE_LABEL: Record<string, string> = {
  PORTAL_LINK: 'My SunPower link sent',
  QUOTE_SENT: 'Quotation link sent',
  QUOTE_ACCEPTED: 'Quotation accepted',
  QUOTE_REJECTED: 'Quotation rejected',
  SURVEY_SCHEDULED: 'Survey scheduled',
  SURVEY_APPROVED: 'Survey approved',
  ORDER_CONFIRMED_CUSTOMER: 'Order confirmed',
  ORDER_CONFIRMED_WAREHOUSE: 'Order confirmed — warehouse',
  INSTALLATION_SCHEDULED: 'Installation date confirmed',
  DISPATCHED: 'Equipment dispatched',
  DELIVERED: 'Equipment delivered',
  INSTALLATION_COMPLETED: 'Installation complete + certificate',
  TICKET_OPENED: 'Service ticket opened',
  TICKET_RESOLVED: 'Service ticket resolved',
  WARRANTY_REMINDER: 'Warranty ending reminder',
  LOW_STOCK: 'Low stock alert',
  STOCK_SHORTAGE: 'Stock shortage on order',
}

export function NotificationsView() {
  const { data, loading, reload } = useData(() => api('/notifications'), [])
  const { busy, mutate } = useMutation()
  const messages = data?.messages ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        sub="Transactional outbox with retries and delivery tracking (D6, D15) — nothing is lost silently"
        actions={
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api('/cron/digest', { method: 'POST' }), { success: 'Daily digest generated', onDone: reload })}>
              <Mail className="h-3.5 w-3.5 mr-1" /> Daily digest
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => api('/cron/outbox', { method: 'POST' }), { success: 'Outbox processed — receipts recorded', onDone: reload })}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', busy && 'animate-spin')} /> Process outbox
            </Button>
          </>
        }
      />
      {loading ? <Loading rows={4} /> : messages.length === 0 ? <EmptyState title="No notifications yet" /> : (
        <div className="space-y-2">
          {messages.map((m: any) => (
            <Card key={m.id} className="py-3">
              <CardContent className="px-4 flex items-start gap-3">
                <span className={cn('mt-0.5 grid h-8 w-8 place-items-center rounded-full shrink-0',
                  m.status === 'DELIVERED' ? 'bg-green-50 text-green-600' : m.status === 'DEAD' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600')}>
                  {m.status === 'DELIVERED' ? <CheckCheck className="h-4 w-4" /> : m.status === 'DEAD' ? <MailX className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{TEMPLATE_LABEL[m.template] ?? m.template}</span>
                    <StageChip status={m.status} />
                    <span className="text-[11px] text-slate-400">{m.channel} → {m.recipient}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {m.payload?.name ? `${m.payload.name} · ` : ''}
                    {m.payload?.link ? <code className="bg-slate-100 rounded px-1">{m.payload.link}</code> : Object.entries(m.payload ?? {}).filter(([k]) => !['to', 'name'].includes(k)).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {relTime(m.createdAt)} · attempts {m.attempts}
                    {m.status === 'DEAD' && m.lastError ? ` · ${m.lastError}` : ''}
                    {m.status === 'SENT' && ' · waiting for provider receipt'}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
