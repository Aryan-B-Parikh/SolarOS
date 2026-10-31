'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  FileText, ArrowLeft, Printer, Send, CheckCircle2, 
  ExternalLink, User, Calendar, ShieldCheck, AlertTriangle, Copy, Check 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface QuoteDetailClientProps {
  initialQuote: any;
}

export default function QuoteDetailClient({ initialQuote }: QuoteDetailClientProps) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSendQuote = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/quotes/${quote.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Failed to send quote');
        return;
      }
      const data = await res.json();
      setQuote({ ...quote, status: data.status, sent_at: data.sent_at });
      const publicLink = `${window.location.origin}/q/${data.rawToken}`;
      setShareUrl(publicLink);
      alert('Quotation successfully dispatched to customer link!');
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error sending quotation');
    } finally {
      setLoading(false);
    }
  };

  const copyShareLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/quotes" className="hover:text-blue-600 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              <span>Quotes</span>
            </Link>
            <span>/</span>
            <span className="font-mono font-semibold text-slate-900">{quote.quote_number}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 font-mono">
              {quote.quote_number} (v{quote.version})
            </h1>
            <StageChip stage={quote.status} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/api/v1/quotes/${quote.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print Branded PDF</span>
          </a>

          {quote.status === 'DRAFT' && (
            <button
              type="button"
              disabled={loading}
              onClick={handleSendQuote}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>Send to Customer</span>
            </button>
          )}

          {quote.status === 'ACCEPTED' && quote.order && (
            <Link
              href={`/orders/${quote.order.id}`}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm"
            >
              <span>View Order {quote.order.order_number}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Share URL Banner if recently sent */}
      {shareUrl && (
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-blue-900 block">Customer Secure Access Link Generated:</span>
            <span className="font-mono text-blue-700 break-all">{shareUrl}</span>
          </div>
          <button
            type="button"
            onClick={copyShareLink}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shrink-0 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Customer Link'}</span>
          </button>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider block">Customer Details</span>
          <div className="font-bold text-slate-900 text-sm">{quote.customer.name}</div>
          <div className="text-slate-600">{quote.customer.phone}</div>
          <div className="text-slate-600">{quote.customer.address}, {quote.customer.pincode}</div>
          <div className="pt-2 text-slate-400">
            Lead Ref: <Link href={`/leads/${quote.lead_id}`} className="text-blue-600 font-mono hover:underline">{quote.lead.lead_number}</Link>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider block">System Configuration</span>
          <div className="font-bold text-slate-900 text-sm">
            {quote.capacity_kw} kW {quote.system_type === 'OFF_GRID' ? 'Off-Grid (Battery)' : 'On-Grid Net Meter'}
          </div>
          <div className="text-slate-600">Cable Distance: <strong>{quote.cable_distance_m} m</strong></div>
          <div className="text-slate-600">Template: {quote.template?.name || 'Standard'}</div>
          <div className="pt-2 text-slate-400">
            Valid Until: <strong>{formatDateIST(quote.valid_until)}</strong>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider block">Margin & Commercials</span>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Estimated Margin:</span>
            <span className="font-bold text-slate-900 text-sm">
              {((quote.estimated_margin_bp || 0) / 100).toFixed(1)}%
            </span>
          </div>
          {quote.margin_warning && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] font-medium">
              ⚠️ Estimated margin is below the 20% target.
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-slate-100">
            <span className="text-slate-500">Advance Required (30%):</span>
            <MoneyText paise={BigInt(Math.round(Number(quote.total_paise) * 0.3))} className="font-bold text-slate-900" />
          </div>
        </div>
      </div>

      {/* Lines Table */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Quotation Line Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Rule</th>
                <th className="px-3 py-2.5 text-right">Quantity</th>
                <th className="px-3 py-2.5 text-right">Unit Rate</th>
                <th className="px-3 py-2.5 text-right">GST</th>
                <th className="px-3 py-2.5 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {quote.lines.map((l: any, i: number) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{l.description}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      {l.rule}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                    {Number(l.qty)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <MoneyText paise={l.unit_price_paise} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {(l.tax_rate_bp / 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                    <MoneyText paise={l.line_total_paise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Summary */}
        <div className="max-w-xs ml-auto space-y-2 pt-4 border-t border-slate-100 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal:</span>
            <MoneyText paise={quote.subtotal_paise} className="font-semibold text-slate-800" />
          </div>
          {quote.discount_paise > 0n && (
            <div className="flex justify-between text-emerald-700">
              <span>Discount:</span>
              <MoneyText paise={-quote.discount_paise} className="font-semibold" />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">GST Total:</span>
            <MoneyText paise={quote.tax_paise} className="font-semibold text-slate-800" />
          </div>
          <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200">
            <span>Final Total:</span>
            <MoneyText paise={quote.total_paise} className="text-blue-700" />
          </div>
          {quote.subsidy_estimate_paise > 0n && (
            <div className="flex justify-between text-emerald-700 pt-1 font-medium">
              <span>PM Surya Ghar Subsidy:</span>
              <MoneyText paise={quote.subsidy_estimate_paise} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
