// Accounts (S20): payments, invoices and receivables ageing, expenses,
// subsidy tracker and the technician pay summary (FR-8.5).

'use client'

import { useState } from 'react'
import { api, money, fmtDate, num, useData, useMutation, todayStr } from './lib'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { EmptyState, Field, Loading, PageHeader, StageChip } from './shared'
import { Plus, Wallet, FileText, Receipt, Landmark, Users, Printer } from 'lucide-react'
import { PrintOverlay, InvoiceDoc } from './docs'

export function AccountsView() {
  const { data, loading, reload } = useData(() => api('/accounts'), [])
  const month = todayStr().slice(0, 7)
  const { data: payData } = useData(() => api(`/analytics/technician-hours?month=${month}`), [month])
  const [expense, setExpense] = useState({ category: 'FUEL', amountRupees: 500, incurredOn: todayStr(), description: '' })
  const { busy, mutate } = useMutation()
  const [printingInvoice, setPrintingInvoice] = useState<any | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  const openInvoicePdf = async (inv: any) => {
    setInvoiceLoading(true)
    try {
      const res = await api(`/invoices/${inv.id}`)
      setPrintingInvoice(res)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setInvoiceLoading(false)
    }
  }

  if (loading) return <Loading rows={5} />
  const a = data
  const totalReceivable = a.receivables.reduce((s: number, r: any) => s + r.totalPaise, 0)

  return (
    <div className="space-y-5">
      <PageHeader title="Accounts" sub="Payments, invoices, receivables, expenses, subsidy and technician pay" />

      <div className="grid sm:grid-cols-4 gap-3">
        <Card className="py-4"><CardContent className="px-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Invoices</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{a.invoices.length}</div>
        </CardContent></Card>
        <Card className="py-4"><CardContent className="px-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Receivables</div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-amber-700">{money(totalReceivable)}</div>
        </CardContent></Card>
        <Card className="py-4"><CardContent className="px-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Expenses (all)</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{money(a.expenses.reduce((s: number, e: any) => s + e.amountPaise, 0))}</div>
        </CardContent></Card>
        <Card className="py-4"><CardContent className="px-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Subsidy cases</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{a.subsidies.length}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices"><FileText className="h-3.5 w-3.5 mr-1" /> Invoices</TabsTrigger>
          <TabsTrigger value="payments"><Wallet className="h-3.5 w-3.5 mr-1" /> Payments</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="h-3.5 w-3.5 mr-1" /> Expenses</TabsTrigger>
          <TabsTrigger value="subsidy"><Landmark className="h-3.5 w-3.5 mr-1" /> Subsidy</TabsTrigger>
          <TabsTrigger value="techpay"><Users className="h-3.5 w-3.5 mr-1" /> Technician pay</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Invoice</th><th className="px-3 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium text-right">Total</th><th className="px-3 py-2.5 font-medium text-right">Status</th><th className="px-4 py-2.5 font-medium text-right">PDF</th>
              </tr></thead>
              <tbody>
                {a.invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                    <td className="px-3 py-2.5">{inv.customer.name}</td>
                    <td className="px-3 py-2.5 capitalize">{inv.type.toLowerCase()}</td>
                    <td className="px-3 py-2.5 text-slate-500">{fmtDate(inv.issueDate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{money(inv.totalPaise)}</td>
                    <td className="px-3 py-2.5 text-right"><StageChip status={inv.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50" disabled={invoiceLoading} onClick={() => openInvoicePdf(inv)}>
                        <FileText className="h-3 w-3 mr-1" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Payment</th><th className="px-3 py-2.5 font-medium">Order</th><th className="px-3 py-2.5 font-medium">Method</th>
                <th className="px-3 py-2.5 font-medium">Kind</th><th className="px-3 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium text-right">Amount</th>
              </tr></thead>
              <tbody>
                {a.payments.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.reference ?? '—'}</td>
                    <td className="px-3 py-2.5">{p.order?.orderNumber ?? '—'}</td>
                    <td className="px-3 py-2.5">{p.method}</td>
                    <td className="px-3 py-2.5 capitalize">{p.kind.toLowerCase()}</td>
                    <td className="px-3 py-2.5 text-slate-500">{fmtDate(p.receivedOn)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(p.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="expenses">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2"><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead><tr className="border-b text-left text-xs text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Category</th><th className="px-3 py-2.5 font-medium">Description</th><th className="px-4 py-2.5 font-medium text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {a.expenses.map((e: any) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-500">{fmtDate(e.incurredOn)}</td>
                      <td className="px-3 py-2.5 capitalize">{e.category.toLowerCase()}</td>
                      <td className="px-3 py-2.5 text-slate-500">{e.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(e.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Record an expense</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1"><Label>Category</Label>
                  <select className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm" value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>
                    {['FUEL', 'TRANSPORT', 'RENT', 'MARKETING', 'MISC', 'LABOUR'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" value={expense.amountRupees} onChange={(e) => setExpense({ ...expense, amountRupees: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={expense.incurredOn} onChange={(e) => setExpense({ ...expense, incurredOn: e.target.value })} /></div>
                <div className="space-y-1"><Label>Description</Label><Input value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} /></div>
                <Button className="w-full" size="sm" disabled={busy} onClick={() => mutate(() => api('/expenses', { method: 'POST', json: expense }), { success: 'Expense recorded', onDone: reload })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Save expense
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subsidy">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Order</th><th className="px-3 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">Reference</th>
                <th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium text-right">Expected</th><th className="px-4 py-2.5 font-medium text-right">Received</th>
              </tr></thead>
              <tbody>
                {a.subsidies.map((s: any) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium">{s.order.orderNumber}</td>
                    <td className="px-3 py-2.5">{s.order.customer.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{s.applicationRef ?? '—'}</td>
                    <td className="px-3 py-2.5"><StageChip status={s.status} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(s.expectedPaise)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{money(s.receivedPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="techpay">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Technician hours and payable — {month}</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead><tr className="border-b text-left text-xs text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Technician</th><th className="px-3 py-2.5 font-medium text-right">Hours</th><th className="px-4 py-2.5 font-medium text-right">Payable</th>
                </tr></thead>
                <tbody>
                  {(payData?.technicians ?? []).map((t: any) => (
                    <tr key={t.name} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium">{t.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(t.hours, 1)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(t.payablePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(payData?.technicians ?? []).length === 0 && <div className="p-4"><EmptyState title="No hours logged this month" /></div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {printingInvoice && (
        <PrintOverlay title={`Invoice ${printingInvoice.invoice.invoiceNumber}`} onClose={() => setPrintingInvoice(null)}>
          <InvoiceDoc inv={printingInvoice.invoice} branding={printingInvoice.branding} />
        </PrintOverlay>
      )}
    </div>
  )
}
