'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wrench, CheckCircle2, ThumbsDown, ShieldCheck, AlertCircle, Plus, X, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

interface FaultCodeView {
  code: string;
  description: string;
  defaultPriority: string;
}

interface PortalTicket {
  id: string;
  ticketNumber: string;
  category: string;
  faultCode: string | null;
  description: string;
  priority: string;
  status: string;
  warrantyVerdict: string;
  billingMode: string;
  slaDueAt: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

const CATEGORIES = ['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER'] as const;

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: 'bg-blue-100 text-blue-800',
    ASSIGNED: 'bg-indigo-100 text-indigo-800',
    IN_PROGRESS: 'bg-amber-100 text-amber-800',
    RESOLVED: 'bg-emerald-100 text-emerald-800',
    CLOSED: 'bg-slate-200 text-slate-700',
  };
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', styles[status] || 'bg-slate-100 text-slate-600')}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/**
 * FR-10.6 / FR-10.7 — customer portal tickets.
 * - "Raise service request" form (possession of the valid portal link is the auth).
 * - Tickets list with status chips, SLA due and created date.
 * - RESOLVED tickets: "Confirm Fixed" / "Not Fixed" actions, gated by the D11
 *   verified session (phone last-4 challenge) when the cookie is absent.
 */
export default function PortalTicketsClient({
  token,
  initialTickets,
  faultCatalogue,
  initiallyVerified,
}: {
  token: string;
  initialTickets: PortalTicket[];
  faultCatalogue: Record<string, FaultCodeView[]>;
  initiallyVerified: boolean;
}) {
  const router = useRouter();

  const [verified, setVerified] = useState(initiallyVerified);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  // Raise form state
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('NO_POWER');
  const [faultCode, setFaultCode] = useState('');
  const [customFaultCode, setCustomFaultCode] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{
    ticketNumber: string;
    warrantyVerdict: string;
    billingMode: string;
    slaDueAt: string;
  } | null>(null);

  // D11 challenge state
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [phoneLastFour, setPhoneLastFour] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Reopen reason state
  const [reopenFor, setReopenFor] = useState<PortalTicket | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const handleRaiseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        category,
        description,
        priority: 'NORMAL',
      };
      const effectiveFaultCode =
        category === 'FAULT_CODE'
          ? faultCode === '__CUSTOM__'
            ? customFaultCode.trim()
            : faultCode || undefined
          : undefined;
      if (effectiveFaultCode) payload.faultCode = effectiveFaultCode;

      const res = await fetch(`/api/v1/portal/${encodeURIComponent(token)}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Could not raise the service request');
      setCreatedTicket({
        ticketNumber: data.ticket_number,
        warrantyVerdict: data.warranty_verdict,
        billingMode: data.billing_mode,
        slaDueAt: data.sla_due_at,
      });
      setShowForm(false);
      setDescription('');
      setFaultCode('');
      setCustomFaultCode('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/portal/${encodeURIComponent(token)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneLastFour }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Verification failed');
      setVerified(true);
      setChallengeOpen(false);
      setPhoneLastFour('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirm = async (ticket: PortalTicket) => {
    setBusyTicketId(ticket.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/portal/${encodeURIComponent(token)}/tickets/${encodeURIComponent(ticket.id)}/confirm`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === 'VERIFICATION_REQUIRED') {
          setVerified(false);
          setChallengeOpen(true);
          throw new Error('Please complete the quick security check below to confirm this resolution.');
        }
        throw new Error(data.error?.message || 'Could not confirm the resolution');
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenFor) return;
    setBusyTicketId(reopenFor.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/portal/${encodeURIComponent(token)}/tickets/${encodeURIComponent(reopenFor.id)}/reopen`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reopenReason }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === 'VERIFICATION_REQUIRED') {
          setVerified(false);
          setChallengeOpen(true);
          throw new Error('Please complete the quick security check below to reopen this ticket.');
        }
        throw new Error(data.error?.message || 'Could not reopen the ticket');
      }
      setReopenFor(null);
      setReopenReason('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyTicketId(null);
    }
  };

  const requestSensitiveAction = (ticket: PortalTicket, action: 'confirm' | 'reopen') => {
    if (!verified) {
      setChallengeOpen(true);
      return;
    }
    if (action === 'confirm') void handleConfirm(ticket);
    else {
      setReopenFor(ticket);
      setReopenReason('');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Created ticket confirmation banner */}
      {createdTicket && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Service request {createdTicket.ticketNumber} raised successfully
          </div>
          <p className="text-emerald-800">
            Warranty verdict: {createdTicket.warrantyVerdict.replace(/_/g, ' ')} • Billing:{' '}
            {createdTicket.billingMode} • Our team will respond by {formatDateTimeIST(createdTicket.slaDueAt)} IST.
          </p>
        </div>
      )}

      {/* D11 phone challenge (only for confirm/reopen) */}
      {challengeOpen && !verified && (
        <form
          onSubmit={handleVerify}
          className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600" /> Quick security check
              </h4>
              <p className="text-[11px] text-amber-800 mt-1">
                Confirming or reopening a ticket needs one extra verification. Enter the{' '}
                <strong>last 4 digits of your registered phone number</strong> to continue (valid for 30 minutes).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChallengeOpen(false)}
              className="text-amber-600 hover:text-amber-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={phoneLastFour}
              onChange={(e) => setPhoneLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Last 4 digits"
              className="w-40 px-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none font-mono tracking-widest"
            />
            <button
              type="submit"
              disabled={verifying || phoneLastFour.length !== 4}
              className="px-3.5 py-2 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        </form>
      )}

      {/* Raise service request (FR-10.6) */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Raise a Service Request
        </button>
      ) : (
        <form onSubmit={handleRaiseTicket} className="p-5 rounded-2xl border border-purple-200 bg-white space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-600" /> New Service Request
            </h4>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            In-warranty service is free of charge. Our team responds within the SLA for your request priority.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500">What is the issue?</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as any);
                  setFaultCode('');
                  setCustomFaultCode('');
                }}
                className="w-full mt-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-slate-50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            {category === 'FAULT_CODE' && (
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500">
                  Fault code shown on the inverter
                </label>
                <select
                  value={faultCode}
                  onChange={(e) => setFaultCode(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-slate-50"
                >
                  <option value="">Select a fault code…</option>
                  {Object.entries(faultCatalogue).map(([model, codes]) => (
                    <optgroup key={model} label={model}>
                      {codes.map((fc) => (
                        <option key={`${model}-${fc.code}`} value={fc.code}>
                          {fc.code} — {fc.description}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__CUSTOM__">My code is not listed…</option>
                </select>
                {faultCode === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customFaultCode}
                    onChange={(e) => setCustomFaultCode(e.target.value)}
                    placeholder="Type the exact code from the display"
                    className="w-full mt-2 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono"
                  />
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500">Describe the problem</label>
            <textarea
              required
              minLength={5}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. The inverter shows a red light and there is no power since morning."
              className="w-full mt-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-slate-50"
            />
          </div>
          <p className="text-[10px] text-slate-400">
            Priority is set to NORMAL. Our support team will escalate it if needed once the request is reviewed.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (category === 'FAULT_CODE' && faultCode === '__CUSTOM__' && !customFaultCode.trim())}
              className="px-4 py-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      )}

      {/* Tickets list (FR-10.7) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900">My Service Requests ({initialTickets.length})</h4>
          {verified && (
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Verified session
            </span>
          )}
        </div>
        {initialTickets.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-slate-400">
            You have no service requests yet. Use “Raise a Service Request” above if something is not working.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {initialTickets.map((t) => (
              <li key={t.id} className="px-5 py-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-slate-800 text-xs">{t.ticketNumber}</span>
                  <StatusChip status={t.status} />
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold',
                      t.warrantyVerdict === 'IN_WARRANTY'
                        ? 'bg-emerald-50 text-emerald-700'
                        : t.warrantyVerdict === 'EXCLUDED'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700'
                    )}
                  >
                    {t.warrantyVerdict.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-slate-400">• {t.billingMode}</span>
                </div>
                <p className="text-xs text-slate-700">
                  <span className="font-semibold">{t.category.replace(/_/g, ' ')}</span>
                  {t.faultCode && <span className="font-mono ml-1.5 text-amber-800">({t.faultCode})</span>}
                  {t.priority !== 'NORMAL' && (
                    <span className="ml-1.5 text-[10px] font-bold text-red-600">{t.priority} priority</span>
                  )}
                  <span className="block text-slate-500 mt-0.5">{t.description}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
                  <span>Raised on {formatDateIST(t.createdAt)}</span>
                  {!['CLOSED'].includes(t.status) && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> SLA due {formatDateTimeIST(t.slaDueAt)} IST
                    </span>
                  )}
                  {t.resolvedAt && <span>Resolved on {formatDateIST(t.resolvedAt)}</span>}
                </div>
                {t.status === 'RESOLVED' && t.resolutionNotes && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    <strong>Technician notes:</strong> {t.resolutionNotes}
                  </p>
                )}

                {/* Sensitive actions for RESOLVED tickets — D11 verified session required */}
                {t.status === 'RESOLVED' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyTicketId === t.id}
                      onClick={() => requestSensitiveAction(t, 'confirm')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {busyTicketId === t.id ? 'Working…' : 'Confirm Fixed'}
                    </button>
                    <button
                      type="button"
                      disabled={busyTicketId === t.id}
                      onClick={() => requestSensitiveAction(t, 'reopen')}
                      className="px-3.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> Not Fixed
                    </button>
                  </div>
                )}

                {/* Inline reopen reason form */}
                {reopenFor?.id === t.id && (
                  <form onSubmit={handleReopen} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <label className="block text-[10px] font-bold uppercase text-amber-800">
                      What is still not working?
                    </label>
                    <textarea
                      required
                      minLength={3}
                      rows={2}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="e.g. The inverter tripped again this morning with the same fault."
                      className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReopenFor(null)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={busyTicketId === t.id}
                        className="px-3.5 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg disabled:opacity-50"
                      >
                        {busyTicketId === t.id ? 'Reopening…' : 'Reopen Request'}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
