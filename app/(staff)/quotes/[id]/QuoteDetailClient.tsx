'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, ArrowLeft, Printer, Send, CheckCircle2,
  ExternalLink, User, Calendar, ShieldCheck, AlertTriangle, Copy, Check,
  History, RefreshCw, X, ShieldAlert, Loader2
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface QuoteVersionDto {
  id: string;
  quote_number: string;
  version: number;
  status: string;
  total_paise: string;
  supersedes_id: string | null;
  created_at: string;
}

interface QuoteDetailClientProps {
  initialQuote: any;
  versions: QuoteVersionDto[];
  currentUser?: { id: string; name: string; role: string } | null;
}

export default function QuoteDetailClient({ initialQuote, versions, currentUser }: QuoteDetailClientProps) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revise Quote modal (FR-3.6)
  const [isReviseOpen, setIsReviseOpen] = useState(false);
  const [reviseForm, setReviseForm] = useState({
    discountRupees: Number(quote.discount_paise) / 100,
    validDays: 15,
    capacityKw: Number(quote.capacity_kw),
    cableDistanceM: Number(quote.cable_distance_m),
  });
  const [reviseLoading, setReviseLoading] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);

  const canRevise =
    (currentUser?.role === 'DIRECTOR' || currentUser?.role === 'SALES') &&
    quote.status !== 'SUPERSEDED' &&
    quote.status !== 'ACCEPTED';

  // FR-3.4: discount above the 5% sales authority?
  const subtotal = BigInt(quote.subtotal_paise);
  const discountPaise = BigInt(quote.discount_paise);
  const discountPercent = subtotal > 0n ? Number((discountPaise * 10000n) / subtotal) / 100 : 0;
  const needsDiscountApproval = discountPercent > 5;
  const discountApprover = quote.discount_approver;
  const showApproveDiscount =
    needsDiscountApproval && !discountApprover && currentUser?.role === 'DIRECTOR' && canRevise;

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

  // FR-3.6: revise the quote via the revise endpoint. The service supersedes
  // this version and creates v+1 with the new parameters.
  const handleReviseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviseLoading(true);
    setReviseError(null);
    try {
      const res = await fetch(`/api/v1/quotes/${quote.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          discountRupees: Number(reviseForm.discountRupees),
          validDays: Number(reviseForm.validDays),
          capacityKw: Number(reviseForm.capacityKw),
          cableDistanceM: Number(reviseForm.cableDistanceM),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to revise quote');
      }
      setIsReviseOpen(false);
      router.push(`/quotes/${data.quote.id}`);
      router.refresh();
    } catch (err: any) {
      setReviseError(err.message || 'Error revising quote');
    } finally {
      setReviseLoading(false);
    }
  };

  // FR-3.4: Director approves an above-authority discount by re-applying the
  // same discount via reviseQuote - the service stamps discount_approved_by.
  const handleApproveDiscount = async () => {
    setReviseLoading(true);
    setReviseError(null);
    try {
      const res = await fetch(`/api/v1/quotes/${quote.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          discountRupees: Number(discountPaise) / 100,
          validDays: 15,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to approve discount');
      }
      router.push(`/quotes/${data.quote.id}`);
      router.refresh();
    } catch (err: any) {
      setReviseError(err.message || 'Error approving discount');
    } finally {
      setReviseLoading(false);
    }
  };

  const sortedVersions = [...versions].sort((a, b) => a.version - b.version);

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
            {quote.status === 'SUPERSEDED' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                SUPERSEDED - READ ONLY
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/v1/quotes/${quote.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print Branded PDF</span>
          </a>

          {canRevise && (
            <button
              type="button"
              onClick={() => {
                setReviseForm({
                  discountRupees: Number(discountPaise) / 100,
                  validDays: 15,
                  capacityKw: Number(quote.capacity_kw),
                  cableDistanceM: Number(quote.cable_distance_m),
                });
                setReviseError(null);
                setIsReviseOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-blue-300 hover:bg-blue-50 text-blue-700 flex items-center gap-1.5 shadow-2xs"
              title="Create the next version of this quotation (FR-3.6)"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Revise Quote</span>
            </button>
          )}

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

      {reviseError && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span>{reviseError}</span>
        </div>
      )}

      {/* FR-3.4 discount approval banner */}
      {needsDiscountApproval && (
        <div
          className={clsx(
            'p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs',
            discountApprover
              ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
              : 'border-amber-300 bg-amber-50/70 text-amber-900'
          )}
        >
          <div className="flex items-start gap-2">
            {discountApprover ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {discountPercent.toFixed(1)}% discount - above the 5% sales authority (Q5 / FR-3.4).
              </p>
              {discountApprover ? (
                <p className="mt-0.5">
                  Approved by{' '}
                  <strong>
                    {discountApprover.name} ({discountApprover.role})
                  </strong>
                  .
                </p>
              ) : (
                <p className="mt-0.5">
                  Director approval required.{' '}
                  {currentUser?.role === 'DIRECTOR'
                    ? 'Approve to stamp this quotation with your authority.'
                    : 'Ask a Director to approve from this screen.'}
                </p>
              )}
            </div>
          </div>
          {showApproveDiscount && (
            <button
              type="button"
              onClick={handleApproveDiscount}
              disabled={reviseLoading}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-60 shrink-0"
              title="Creates the next version with the same discount and records you as the approver"
            >
              {reviseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Approve Discount &amp; Revise</span>
            </button>
          )}
        </div>
      )}

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

      {/* Version History (FR-3.6) */}
      {sortedVersions.length > 1 && (
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <span>Version History ({sortedVersions.length} revisions)</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {sortedVersions.map((v) => {
              const isCurrent = v.id === quote.id;
              const isSuperseded = v.status === 'SUPERSEDED';
              return (
                <Link
                  key={v.id}
                  href={`/quotes/${v.id}`}
                  className={clsx(
                    'px-3 py-2 rounded-lg border text-xs font-semibold flex flex-col gap-0.5 min-w-[150px] transition-colors',
                    isCurrent
                      ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-300'
                      : isSuperseded
                      ? 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono">
                      v{v.version} &bull; {v.quote_number}
                    </span>
                    {isSuperseded && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-600">
                        Superseded
                      </span>
                    )}
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-200 text-blue-800">
                        Viewing
                      </span>
                    )}
                  </span>
                  <span className="font-normal opacity-75">
                    <MoneyText paise={BigInt(v.total_paise)} /> &bull; {formatDateIST(v.created_at)}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">
            Superseded versions are immutable and read-only; only the newest version can be sent or revised.
          </p>
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
          <span className="font-bold text-slate-400 uppercase tracking-wider block">Margin &amp; Commercials</span>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Estimated Margin:</span>
            <span className="font-bold text-slate-900 text-sm">
              {((quote.estimated_margin_bp || 0) / 100).toFixed(1)}%
            </span>
          </div>
          {quote.margin_warning && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] font-medium">
              ⚠️ Estimated margin is below the configured target (FR-3.8).
            </div>
          )}
          {discountApprover && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Discount approved by {discountApprover.name} ({discountApprover.role})
              </span>
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
            <MoneyText paise={BigInt(quote.subtotal_paise)} className="font-semibold text-slate-800" />
          </div>
          {BigInt(quote.discount_paise) > 0n && (
            <div className="flex justify-between text-emerald-700">
              <span>Discount ({discountPercent.toFixed(1)}%):</span>
              <MoneyText paise={-BigInt(quote.discount_paise)} className="font-semibold" />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">GST Total:</span>
            <MoneyText paise={BigInt(quote.tax_paise)} className="font-semibold text-slate-800" />
          </div>
          <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200">
            <span>Final Total:</span>
            <MoneyText paise={BigInt(quote.total_paise)} className="text-blue-700" />
          </div>
          {BigInt(quote.subsidy_estimate_paise) > 0n && (
            <div className="flex justify-between text-emerald-700 pt-1 font-medium">
              <span>PM Surya Ghar Subsidy:</span>
              <MoneyText paise={BigInt(quote.subsidy_estimate_paise)} />
            </div>
          )}
        </div>
      </div>

      {/* Revise Quote Modal (FR-3.6) */}
      {isReviseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-600" />
                <span>Revise Quote (v{quote.version} &rarr; v{quote.version + 1})</span>
              </h2>
              <button type="button" onClick={() => setIsReviseOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 mt-2">
              This version will be marked SUPERSEDED (read-only) and a new draft v{quote.version + 1} will be
              created with the parameters below.
              {currentUser?.role !== 'DIRECTOR' && ' Discounts above 5% require Director approval (Q5).'}
            </p>

            <form onSubmit={handleReviseSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount (Rupees)</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={reviseForm.discountRupees}
                    onChange={(e) => setReviseForm({ ...reviseForm, discountRupees: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valid Days</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={reviseForm.validDays}
                    onChange={(e) => setReviseForm({ ...reviseForm, validDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity (kW)</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={reviseForm.capacityKw}
                    onChange={(e) => setReviseForm({ ...reviseForm, capacityKw: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cable Distance (m)</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={reviseForm.cableDistanceM}
                    onChange={(e) => setReviseForm({ ...reviseForm, cableDistanceM: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReviseOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviseLoading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs disabled:opacity-60"
                >
                  {reviseLoading ? 'Revising…' : `Create v${quote.version + 1}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
