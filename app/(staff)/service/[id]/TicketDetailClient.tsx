'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, RefreshCw, Wrench,
  AlertCircle, ShieldAlert, Camera, Ban
} from 'lucide-react';
import { formatDateIST } from '@/lib/dates';
import { formatPaiseLakhs } from '@/lib/money';

export default function TicketDetailClient({
  ticket,
  userRole,
}: {
  ticket: any;
  userRole: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Replacement Form State
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [removedCode, setRemovedCode] = useState(ticket.unit?.serial_number || '');
  const [replacementCode, setReplacementCode] = useState('');

  // Resolution Form State
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isChargeable, setIsChargeable] = useState(ticket.billing_mode === 'CHARGEABLE');
  const [laborCost, setLaborCost] = useState(ticket.billing_mode === 'CHARGEABLE' ? '1500' : '0');

  // Confirmation Form State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMethod, setConfirmMethod] = useState<'PORTAL' | 'PHONE'>('PHONE');
  const [feedback, setFeedback] = useState('');

  // Reopen Form State
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // FR-7.7 Warranty Exclusion State (DIRECTOR only, photo evidence required)
  const [excludeReason, setExcludeReason] = useState('');
  const [excludePhotoId, setExcludePhotoId] = useState<string | null>(null);
  const [excludePhotoName, setExcludePhotoName] = useState<string | null>(null);
  const [excludeUploading, setExcludeUploading] = useState(false);
  const [excludeSubmitting, setExcludeSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirector = userRole === 'DIRECTOR';
  const alreadyExcluded =
    ticket.warranty_verdict === 'EXCLUDED' || ticket.warranty?.status === 'VOID';

  const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcludeUploading(true);
    setErrorMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('entityType', 'TICKET');
      form.append('entityId', ticket.id);
      form.append('kind', 'OTHER');
      const res = await fetch('/api/v1/uploads', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Photo upload failed');
      setExcludePhotoId(data.id);
      setExcludePhotoName(file.name);
    } catch (err: any) {
      setErrorMessage(err.message);
      setExcludePhotoId(null);
      setExcludePhotoName(null);
    } finally {
      setExcludeUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExcludeWarranty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excludePhotoId) {
      setErrorMessage('Photo evidence is required before excluding warranty (FR-7.7).');
      return;
    }
    setExcludeSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/exclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: excludeReason,
          photoAttachmentId: excludePhotoId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Exclusion failed');
      setExcludeReason('');
      setExcludePhotoId(null);
      setExcludePhotoName(null);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setExcludeSubmitting(false);
    }
  };

  // Handlers
  const handleReplacePart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/parts/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removedUnitCode: removedCode,
          replacementUnitCode: replacementCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Replacement failed');
      setShowReplaceModal(false);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolutionNotes,
          isChargeable,
          laborCostPaise: parseInt(laborCost || '0') * 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Resolution failed');
      setShowResolveModal(false);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationMethod: confirmMethod,
          customerFeedback: feedback,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Confirmation failed');
      setShowConfirmModal(false);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReopenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reopenReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Reopening failed');
      setShowReopenModal(false);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          Current Status: <span className="font-bold text-slate-800">{ticket.status}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ticket.status !== 'CLOSED' && (
            <button
              onClick={() => setShowReplaceModal(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5 text-slate-500" />
              <span>RMA Part Replacement</span>
            </button>
          )}

          {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
            <button
              onClick={() => setShowResolveModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Resolve Ticket</span>
            </button>
          )}

          {ticket.status === 'RESOLVED' && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm & Close (Customer Sign-off)</span>
            </button>
          )}

          {(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
            <button
              onClick={() => setShowReopenModal(true)}
              className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reopen Ticket ({ticket.reopen_count})</span>
            </button>
          )}
        </div>
      </div>

      {/* FR-7.7: Warranty Exclusion Panel (DIRECTOR only, photo evidence mandatory) */}
      {isDirector && !alreadyExcluded && (
        <div className="bg-white border border-red-200 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-600" />
            <span>Exclude from Warranty (Director Approval, FR-7.7)</span>
          </h2>
          <p className="text-[11px] text-slate-500">
            Excluding warranty voids the linked warranty record and switches this ticket to CHARGEABLE billing.
            Photo evidence (physical damage / tampering) is <strong>mandatory</strong> — upload at least one photo
            taken against this ticket before submitting.
          </p>
          <form onSubmit={handleExcludeWarranty} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Photo Evidence <span className="text-red-500">(required)</span>
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Camera className="w-3.5 h-3.5 text-slate-500" />
                    <span>{excludeUploading ? 'Uploading…' : 'Upload photo'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleUploadEvidence}
                      disabled={excludeUploading}
                    />
                  </label>
                  {excludePhotoId && (
                    <span className="text-[11px] text-emerald-700 font-semibold truncate">
                      ✓ {excludePhotoName || 'photo uploaded'} ({excludePhotoId.slice(0, 8)}…)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Exclusion Reason <span className="text-red-500">(min 3 chars)</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={excludeReason}
                  onChange={(e) => setExcludeReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder="e.g. Physical impact damage to panel array"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={excludeSubmitting || !excludePhotoId || excludeReason.trim().length < 3}
                className="px-3.5 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{excludeSubmitting ? 'Excluding…' : 'Exclude Warranty & Mark Chargeable'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
      {isDirector && alreadyExcluded && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            Warranty excluded / voided for this ticket{ticket.warranty?.void_reason ? ` — reason: ${ticket.warranty.void_reason}` : ''}.
            Billing mode is CHARGEABLE.
          </span>
        </div>
      )}

      {/* Parts & Billing Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Parts Replacement History */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Parts Used / Replaced</span>
            <span className="text-[11px] font-normal text-slate-400">Rule C9 & ADR D5</span>
          </h2>
          {ticket.parts && ticket.parts.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {ticket.parts.map((p: any) => (
                <div key={p.id} className="py-2.5 text-xs flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-slate-800">{p.product?.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Removed: <code className="bg-slate-50 px-1">{p.removed_unit?.serial_number || 'N/A'}</code> → 
                      Installed: <code className="bg-emerald-50 text-emerald-800 px-1">{p.installed_unit?.serial_number || 'N/A'}</code>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.chargeable ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {p.chargeable ? 'Chargeable' : 'Under Warranty'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No parts replaced for this ticket yet.</p>
          )}
        </div>

        {/* Generated Invoices */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Service Invoices</span>
            <span className="text-[11px] font-normal text-slate-400">Auto-generated</span>
          </h2>
          {ticket.invoices && ticket.invoices.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {ticket.invoices.map((inv: any) => (
                <div key={inv.id} className="py-2.5 text-xs flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-slate-800 font-mono">{inv.invoice_number}</div>
                    <div className="text-[11px] text-slate-500">
                      Issued: {formatDateIST(inv.issue_date)} • {inv.status}
                    </div>
                  </div>
                  <div className="text-right font-bold text-slate-900">
                    {formatPaiseLakhs(inv.total_paise)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              {ticket.warranty_verdict === 'IN_WARRANTY'
                ? 'Zero charge invoice (Covered under equipment warranty).'
                : 'No invoices generated yet.'}
            </p>
          )}
        </div>
      </div>

      {/* Timeline of Events */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Activity & Audit Timeline
        </h2>
        <div className="space-y-3">
          {ticket.events?.map((ev: any) => (
            <div key={ev.id} className="flex items-start gap-3 text-xs">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold text-slate-800">{ev.type}</span>: {ev.note}
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {formatDateIST(ev.created_at)} {ev.actor?.name ? `• by ${ev.actor.name}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: RMA Part Replacement */}
      {showReplaceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" />
              <span>RMA Equipment Replacement (Screen S18)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Removes faulty unit to RMA, installs new warehouse unit, and executes warranty transfer chain.
            </p>
            <form onSubmit={handleReplacePart} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Removed Unit Serial / QR Code
                </label>
                <input
                  type="text"
                  required
                  value={removedCode}
                  onChange={(e) => setRemovedCode(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. INV3K-24A-001873"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Replacement Unit Serial / QR Code (Must be IN_STOCK)
                </label>
                <input
                  type="text"
                  required
                  value={replacementCode}
                  onChange={(e) => setReplacementCode(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Scan or enter new unit serial..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Confirm Replacement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Resolve Ticket */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Resolve Service Ticket</span>
            </h3>
            <form onSubmit={handleResolveTicket} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Resolution Notes
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Describe corrective actions performed..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chargeableCheck"
                  checked={isChargeable}
                  onChange={(e) => setIsChargeable(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="chargeableCheck" className="text-xs text-slate-700 font-medium">
                  Bill customer for service & labor (Chargeable)
                </label>
              </div>
              {isChargeable && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600">
                    Labor Cost (₹)
                  </label>
                  <input
                    type="number"
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loading ? 'Resolving...' : 'Complete Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Customer Confirmation */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Customer Resolution Confirmation (Rule C9)</span>
            </h3>
            <p className="text-xs text-slate-500">
              The database constraint requires customer confirmation before a ticket can be CLOSED.
            </p>
            <form onSubmit={handleConfirmResolution} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Confirmation Channel
                </label>
                <select
                  value={confirmMethod}
                  onChange={(e) => setConfirmMethod(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="PHONE">Phone Call / Verbal Confirmation</option>
                  <option value="PORTAL">Customer Portal OTP / Sign-off</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Customer Feedback / Notes
                </label>
                <textarea
                  rows={2}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Customer satisfied, system generating 2.8 kW normally."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loading ? 'Closing...' : 'Close Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reopen Ticket */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              <span>Reopen Service Ticket</span>
            </h3>
            <form onSubmit={handleReopenTicket} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Reason for Reopening
                </label>
                <textarea
                  required
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Issue recurred next morning, inverter throwing E001 again."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? 'Reopening...' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

