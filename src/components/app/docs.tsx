// Printable documents (FR-3.5, FR-8.6, FR-10.5, FR-10.8): branded quote,
// invoice and warranty-certificate sheets that print/save as PDF through the
// browser, exactly like the completion certificate. Render inside a
// .print-overlay so window.print() outputs only the document.

'use client'

import { ReactNode } from 'react'
import { money, fmtDate, num } from './lib'
import { Button } from '@/components/ui/button'
import { Printer, X } from 'lucide-react'

export interface Branding {
  companyName: string
  gstin: string
  address: string
  phone: string
  email: string
  bankDetails: string
}

/** Full-screen overlay; printing it prints only the document sheet. */
export function PrintOverlay({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm overflow-auto print-overlay p-4 sm:p-8">
      <div className="mx-auto max-w-[820px]">
        <div className="no-print flex items-center justify-between mb-3 text-white">
          <div className="text-sm font-medium">{title}</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print / save as PDF</Button>
            <Button size="sm" variant="outline" onClick={onClose}><X className="h-3.5 w-3.5 mr-1" /> Close</Button>
          </div>
        </div>
        <div className="bg-white text-slate-900 rounded-lg shadow-2xl print:rounded-none print:shadow-none">
          {children}
        </div>
      </div>
    </div>
  )
}

function DocHeader({ branding, docTitle, refNumber }: { branding: Branding; docTitle: string; refNumber: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="h-10 w-10" />
        <div>
          <div className="text-lg font-bold leading-tight">{branding.companyName}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-line leading-snug">
            {branding.address}{`\n`}{branding.phone} · {branding.email}{`\n`}GSTIN: {branding.gstin}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{docTitle}</div>
        <div className="text-base font-bold font-mono">{refNumber}</div>
      </div>
    </div>
  )
}

function DocFooter({ branding, note }: { branding: Branding; note?: string }) {
  return (
    <div className="border-t pt-3 mt-6 text-[10px] text-slate-500 leading-relaxed">
      {note && <div className="mb-1 italic text-slate-600">{note}</div>}
      <div>Bank transfer: {branding.bankDetails}</div>
      <div>This is a computer-generated document. Figures marked “estimate” are indicative and not contractual.</div>
    </div>
  )
}

export interface QuoteDocData {
  quoteNumber: string
  version: number
  status: string
  capacityKw: number
  systemType: string
  issueDate?: string | null
  validUntil: string | null
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  subsidyEstimatePaise: number
  lines: { description: string; qty: number; uom?: string; unitPricePaise: number; lineTotalPaise: number }[]
  customerName?: string | null
  savings?: { annualGenerationKwh: number; annualSavingsPaise: number; paybackYears: number | null } | null
}

export function QuoteDoc({ q, branding }: { q: QuoteDocData; branding: Branding }) {
  return (
    <div className="p-8 text-sm">
      <DocHeader branding={branding} docTitle="Quotation" refNumber={`${q.quoteNumber} · v${q.version}`} />
      <div className="grid grid-cols-2 gap-6 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Prepared for</div>
          <div className="font-semibold">{q.customerName ?? '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">System</div>
          <div className="font-semibold">{q.capacityKw} kW {q.systemType === 'ON_GRID' ? 'On-Grid' : q.systemType === 'OFF_GRID' ? 'Off-Grid' : 'Panel set'}</div>
          {q.validUntil && <div className="text-xs text-slate-500 mt-0.5">Valid until {fmtDate(q.validUntil)}</div>}
        </div>
      </div>
      <table className="w-full text-sm border-t">
        <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b">
          <th className="py-2 font-semibold">Item</th><th className="text-right font-semibold">Qty</th>
          <th className="text-right font-semibold">Rate</th><th className="text-right font-semibold">Amount</th>
        </tr></thead>
        <tbody>
          {q.lines.map((l, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5">{l.description}</td>
              <td className="text-right tabular-nums">{num(l.qty)}{l.uom ? ` ${l.uom.toLowerCase()}` : ''}</td>
              <td className="text-right tabular-nums text-slate-500">{money(l.unitPricePaise)}</td>
              <td className="text-right tabular-nums">{money(l.lineTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 ml-auto w-64 space-y-1">
        <Row label="Subtotal" value={money(q.subtotalPaise)} />
        {q.discountPaise > 0 && <Row label="Discount" value={`− ${money(q.discountPaise)}`} />}
        <Row label="Tax (GST)" value={money(q.taxPaise)} />
        <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span className="tabular-nums">{money(q.totalPaise)}</span></div>
        {q.subsidyEstimatePaise > 0 && <div className="flex justify-between text-[11px] text-slate-400"><span>Indicative subsidy (not deducted)</span><span className="tabular-nums">≈ {money(q.subsidyEstimatePaise)}</span></div>}
      </div>
      {q.savings && (
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 mb-2">Estimated savings summary</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Metric label="Yearly generation" value={`${num(q.savings.annualGenerationKwh)} kWh`} />
            <Metric label="Yearly savings" value={money(q.savings.annualSavingsPaise)} />
            <Metric label="Payback" value={q.savings.paybackYears != null ? `≈ ${q.savings.paybackYears} years` : '—'} />
          </div>
          <div className="text-[10px] text-slate-500 mt-2">All figures are estimates and depend on site conditions, tariff and usage.</div>
        </div>
      )}
      <DocFooter branding={branding} note="Prices inclusive of GST as itemised. Installation service included as a line item." />
    </div>
  )
}

export interface InvoiceDocData {
  invoiceNumber: string
  type: string
  issueDate: string
  dueDate?: string | null
  subtotalPaise: number
  taxPaise: number
  totalPaise: number
  status: string
  orderNumber?: string | null
  customerName?: string | null
  lines: { description: string; qty: number; unitPricePaise: number; lineTotalPaise: number }[]
}

export function InvoiceDoc({ inv, branding }: { inv: InvoiceDocData; branding: Branding }) {
  return (
    <div className="p-8 text-sm">
      <DocHeader branding={branding} docTitle="Tax invoice" refNumber={inv.invoiceNumber} />
      <div className="grid grid-cols-3 gap-6 py-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Billed to</div>
          <div className="font-semibold">{inv.customerName ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Issue date</div>
          <div className="font-semibold">{fmtDate(inv.issueDate)}</div>
          {inv.dueDate && <div className="text-xs text-slate-500">Due {fmtDate(inv.dueDate)}</div>}
        </div>
        {inv.orderNumber && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Order</div>
            <div className="font-semibold font-mono">{inv.orderNumber}</div>
            <div className="text-xs capitalize text-slate-500">{inv.type.toLowerCase()} invoice · {inv.status.toLowerCase()}</div>
          </div>
        )}
      </div>
      <table className="w-full text-sm border-t">
        <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b">
          <th className="py-2 font-semibold">Description</th><th className="text-right font-semibold">Qty</th>
          <th className="text-right font-semibold">Rate</th><th className="text-right font-semibold">Amount</th>
        </tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5">{l.description}</td>
              <td className="text-right tabular-nums">{num(l.qty)}</td>
              <td className="text-right tabular-nums text-slate-500">{money(l.unitPricePaise)}</td>
              <td className="text-right tabular-nums">{money(l.lineTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 ml-auto w-64 space-y-1">
        <Row label="Subtotal" value={money(inv.subtotalPaise)} />
        <Row label="Tax (GST)" value={money(inv.taxPaise)} />
        <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span className="tabular-nums">{money(inv.totalPaise)}</span></div>
      </div>
      <DocFooter branding={branding} note="Please quote the invoice number with your payment." />
    </div>
  )
}

export interface WarrantyDocData {
  warrantyId: string
  customerName: string
  productName: string
  serialNumber: string
  startDate: string
  endDate: string
  months: number
  coverage: string
  source: string
  status: string
}

export function WarrantyDoc({ w, branding }: { w: WarrantyDocData; branding: Branding }) {
  return (
    <div className="p-8 text-sm">
      <DocHeader branding={branding} docTitle="Warranty certificate" refNumber={w.warrantyId.slice(0, 8).toUpperCase()} />
      <div className="py-6 text-center">
        <div className="text-[10px] uppercase tracking-widest text-slate-400">This certifies that</div>
        <div className="text-xl font-bold mt-1">{w.customerName}</div>
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-4">holds an active warranty on</div>
        <div className="text-lg font-semibold mt-1">{w.productName}</div>
        <div className="font-mono text-sm text-slate-500">SN {w.serialNumber}</div>
      </div>
      <div className="grid grid-cols-3 gap-4 border-t pt-4">
        <Metric label="Starts" value={fmtDate(w.startDate)} />
        <Metric label="Ends" value={fmtDate(w.endDate)} />
        <Metric label="Term" value={`${w.months} months`} />
      </div>
      <div className="grid grid-cols-3 gap-4 mt-3 text-xs text-slate-600">
        <div>Coverage: <span className="font-medium">{w.coverage === 'WORKMANSHIP' ? 'Workmanship' : 'Equipment'}</span></div>
        <div>Origin: <span className="font-medium">{w.source.replace(/_/g, ' ').toLowerCase()}</span></div>
        <div>Status: <span className="font-medium">{w.status.toLowerCase()}</span></div>
      </div>
      <DocFooter branding={branding} note="Warranty covers manufacturing defects per the product's terms; exclusions apply for physical damage and tampering." />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-slate-500">{label}</span><span className="tabular-nums">{value}</span></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
