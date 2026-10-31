'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  User, Phone, MapPin, Calendar, Clock, AlertTriangle, 
  ShieldAlert, CheckCircle2, FileText, ArrowRight, X, 
  Send, Sparkles, Building, Zap, Compass, Ruler, Sun
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { NextStepPanel } from '@/components/NextStepPanel';
import { MoneyText } from '@/components/MoneyText';
import { Timeline, TimelineEvent } from '@/components/Timeline';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';
import clsx from 'clsx';

interface LeadDetailClientProps {
  initialLead: any;
  technicians: any[];
  templates: any[];
}

export default function LeadDetailClient({ initialLead, technicians, templates }: LeadDetailClientProps) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isQualifyOpen, setIsQualifyOpen] = useState(false);
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeStatus, setCloseStatus] = useState<'LOST' | 'DISQUALIFIED'>('LOST');
  const [closeReason, setCloseReason] = useState('');
  const [isReviewSurveyOpen, setIsReviewSurveyOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Qualification form state
  const [qualifyData, setQualifyData] = useState({
    roofAreaSqm: Number(lead.roof_area_sqm) || 30,
    monthlyBillRupees: lead.monthly_bill_paise ? Number(lead.monthly_bill_paise) / 100 : 3000,
    monthlyUnits: Number(lead.monthly_units) || 420,
    tariffRupees: lead.tariff_paise ? Number(lead.tariff_paise) / 100 : 7,
    gridOk: lead.grid_ok ?? true,
    sanctionedLoadKw: Number(lead.sanctioned_load_kw) || 4,
    phase: (lead.phase as 'SINGLE' | 'THREE') || 'SINGLE',
  });

  // Survey booking state
  const [surveyBooking, setSurveyBooking] = useState({
    surveyorId: technicians[0]?.user_id || '',
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  });

  // Determine Next Action based on State Machine
  const getNextActionConfig = () => {
    switch (lead.status) {
      case 'NEW':
        return {
          title: 'Initial Contact Call',
          description: 'Call customer to understand solar requirements and check basic feasibility. 4-hour SLA active.',
          actionLabel: 'Mark as Contacted',
          onAction: () => handleTransition('CONTACTED'),
          variant: 'action' as const,
        };
      case 'CONTACTED':
        return {
          title: 'Feasibility Qualification',
          description: 'Verify roof shadow-free area, electricity bill, grid connection, and sanctioned load.',
          actionLabel: 'Complete Qualification',
          onAction: () => setIsQualifyOpen(true),
          variant: 'action' as const,
        };
      case 'QUALIFIED':
        return {
          title: 'Schedule Site Survey',
          description: 'Lead is qualified. Assign a technician for technical rooftop measurements and photo capture.',
          actionLabel: 'Book Survey',
          onAction: () => setIsSurveyModalOpen(true),
          variant: 'action' as const,
        };
      case 'SURVEY_SCHEDULED':
        const isSurveyDone = lead.survey?.status === 'COMPLETED';
        return {
          title: isSurveyDone ? 'Site Survey Submitted — Awaiting Review' : 'Site Survey in Progress',
          description: isSurveyDone
            ? 'Survey measurements completed. Review roof sizing and approve to unlock quotation.'
            : `Survey assigned to ${lead.survey?.surveyor?.name || 'Technician'}. Review details or open survey form.`,
          actionLabel: isSurveyDone ? 'Review & Approve Survey' : 'Review Survey (Or Open Form)',
          onAction: () => setIsReviewSurveyOpen(true),
          variant: isSurveyDone ? ('success' as const) : ('action' as const),
        };
      case 'SURVEY_APPROVED':
        return {
          title: 'Generate Quotation & BOM',
          description: 'Survey approved. Select a system template to generate dynamic parts list and pricing.',
          actionLabel: 'Create Quote',
          onAction: () => router.push(`/quotes/new?leadId=${lead.id}`),
          variant: 'success' as const,
        };
      case 'QUOTED':
        return {
          title: 'Awaiting Customer Acceptance',
          description: 'Quote sent to customer via portal link. Follow up for acceptance or revision.',
          actionLabel: 'View Quotes',
          onAction: () => router.push(`/quotes`),
          variant: 'action' as const,
        };
      case 'WON':
        return {
          title: 'Lead Converted to Order',
          description: 'Customer accepted quotation. Track advance payment and dispatch in Orders module.',
          actionLabel: 'Go to Orders',
          onAction: () => router.push(`/orders`),
          variant: 'success' as const,
        };
      default:
        return {
          title: 'Lead Closed',
          description: `Lead is closed as ${lead.status}. Reason: ${lead.lost_reason || 'None specified'}`,
          variant: 'action' as const,
        };
    }
  };

  const handleReviewSurvey = async (action: 'APPROVE' | 'REJECT') => {
    if (!lead.survey?.id) return;
    if (action === 'REJECT' && !rejectReason.trim()) {
      alert('Please enter a rejection reason');
      return;
    }
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/v1/surveys/${lead.survey.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'REJECT' ? rejectReason.trim() : undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Survey review failed');
      }
      setIsReviewSurveyOpen(false);
      window.location.reload();
    } catch (e: any) {
      alert(e.message || 'Error reviewing survey');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleTransition = async (toStatus: string, reason?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/leads/${lead.id}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Transition failed');
        return;
      }
      const data = await res.json();
      setLead({ ...lead, status: data.lead.status, first_contacted_at: data.lead.first_contacted_at });
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error executing transition');
    } finally {
      setLoading(false);
    }
  };

  const handleQualifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qualifyData),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Qualification failed');
        return;
      }
      const data = await res.json();
      setLead({ ...lead, ...data.lead });
      setIsQualifyOpen(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error qualifying lead');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveDuplicate = async (flagId: string, action: 'LINK' | 'DISMISS') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/leads/${lead.id}/duplicates/${flagId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Resolution failed');
        return;
      }
      alert(`Duplicate flag marked as ${action}ED`);
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error resolving duplicate flag');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/leads/${lead.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'NOTE', body: noteText }),
      });
      setNoteText('');
      router.refresh();
    } catch (err) {
      // Activity refresh fallback
    } finally {
      setLoading(false);
    }
  };

  const nextAction = getNextActionConfig();

  // Convert activities to timeline events
  const timelineEvents: TimelineEvent[] = (lead.activities || []).map((act: any) => ({
    id: act.id,
    type: act.type,
    title: act.type.replace('_', ' '),
    description: act.body,
    timestamp: act.created_at,
    actorName: act.actor?.name || 'System',
    actorRole: act.actor?.role,
    badge: act.type === 'STATUS_CHANGE' ? 'State Change' : undefined,
    badgeColor: act.type === 'STATUS_CHANGE' ? 'blue' : 'slate',
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/leads" className="hover:text-blue-600 transition-colors">Leads</Link>
          <span>/</span>
          <span className="font-mono font-semibold text-slate-900">{lead.lead_number}</span>
        </div>

        {/* Status Chip & Close Action */}
        <div className="flex items-center gap-3">
          <StageChip stage={lead.status} size="md" />
          {lead.status !== 'LOST' && lead.status !== 'DISQUALIFIED' && lead.status !== 'WON' && (
            <button
              type="button"
              onClick={() => setIsCloseModalOpen(true)}
              className="text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50"
            >
              Close Lead
            </button>
          )}
        </div>
      </div>

      {/* Sticky Next Step Action Panel (Section 3.1) */}
      <NextStepPanel
        title={nextAction.title}
        description={nextAction.description}
        actionLabel={nextAction.actionLabel}
        onAction={nextAction.onAction}
        disabled={nextAction.disabled}
        disabledReason={nextAction.disabledReason}
        variant={nextAction.variant}
      />

      {/* Open Duplicate Flags Banner (FR-1.4) */}
      {lead.duplicate_flags && lead.duplicate_flags.filter((f: any) => f.status === 'OPEN').length > 0 && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 text-slate-900 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <span>Duplicate Address Alert: Potential Match with Existing Customer</span>
          </div>
          {lead.duplicate_flags.filter((f: any) => f.status === 'OPEN').map((flag: any) => (
            <div key={flag.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-white border border-amber-200 text-xs">
              <div>
                <p className="font-semibold text-slate-800">
                  Matches Customer: {flag.matched_customer?.name} ({flag.matched_customer?.customer_number})
                </p>
                <p className="text-slate-600 mt-0.5">
                  Address: {flag.matched_customer?.address}, {flag.matched_customer?.pincode}
                </p>
                <span className="text-[11px] text-amber-700 font-medium">
                  Trigram Similarity Score: {Math.round(Number(flag.score) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleResolveDuplicate(flag.id, 'LINK')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
                >
                  Link Customer
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveDuplicate(flag.id, 'DISMISS')}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs"
                >
                  Dismiss Flag
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Customer Info & Qualification Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Card */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <span>Customer Profile</span>
              </h2>
              <span className="text-xs font-mono text-slate-500 font-medium">
                {lead.customer?.customer_number}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Full Name</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{lead.customer?.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Phone Number</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">{lead.customer?.phone}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Email</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">{lead.customer?.email || '—'}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-medium">Street Address</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">{lead.customer?.address}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">PIN Code</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">{lead.customer?.pincode}</span>
              </div>
            </div>
          </div>

          {/* Qualification Checklist (FR-2.1) */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Site Feasibility & Qualification</span>
              </h2>
              {lead.status !== 'WON' && lead.status !== 'LOST' && (
                <button
                  type="button"
                  onClick={() => setIsQualifyOpen(true)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Edit Feasibility
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Shadow-Free Roof</span>
                <span className="text-base font-bold text-slate-900 mt-0.5 block">
                  {lead.roof_area_sqm ? `${lead.roof_area_sqm} m²` : 'Not Set'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Monthly Electricity Bill</span>
                <span className="text-base font-bold text-slate-900 mt-0.5 block">
                  <MoneyText paise={lead.monthly_bill_paise} />
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Sanctioned Load</span>
                <span className="text-base font-bold text-slate-900 mt-0.5 block">
                  {lead.sanctioned_load_kw ? `${lead.sanctioned_load_kw} kW` : 'Not Set'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Grid & Phase</span>
                <span className="text-base font-bold text-slate-900 mt-0.5 block">
                  {lead.grid_ok ? 'Grid OK' : 'Grid Issue'} • {lead.phase || '1-Phase'}
                </span>
              </div>
            </div>
          </div>

          {/* Site Assessment & Survey Summary (Screen S4) */}
          {lead.assessment && (
            <div className="p-5 rounded-xl border border-blue-200 bg-blue-50/30 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-blue-100">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Site Assessment (Estimated Sizing)</span>
                </h2>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                  Label: Estimate
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-lg border border-blue-100">
                  <span className="text-slate-400 block text-[11px]">Recommended Size</span>
                  <span className="text-base font-bold text-blue-700 mt-0.5 block">
                    {lead.assessment.recommended_kw} kW {lead.assessment.recommended_type}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-blue-100">
                  <span className="text-slate-400 block text-[11px]">Est. Generation</span>
                  <span className="text-base font-bold text-slate-800 mt-0.5 block">
                    {Number(lead.assessment.annual_generation_kwh).toLocaleString()} kWh / yr
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-blue-100">
                  <span className="text-slate-400 block text-[11px]">Est. Annual Savings</span>
                  <span className="text-base font-bold text-emerald-700 mt-0.5 block">
                    <MoneyText paise={lead.assessment.annual_savings_paise} />
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-blue-100">
                  <span className="text-slate-400 block text-[11px]">Est. Payback</span>
                  <span className="text-base font-bold text-slate-800 mt-0.5 block">
                    {lead.assessment.payback_years} Years
                  </span>
                </div>
              </div>

              {lead.assessment.ai_summary && (
                <div className="bg-white p-3.5 rounded-lg border border-blue-100 text-xs text-slate-700">
                  <p className="font-semibold text-slate-800 mb-1">AI Site Advisory Summary:</p>
                  <p className="leading-relaxed">{lead.assessment.ai_summary}</p>
                </div>
              )}
            </div>
          )}

          {/* Quotations List */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Quotations ({lead.quotes?.length || 0})</span>
              </h2>
              {lead.status === 'SURVEY_APPROVED' && (
                <Link
                  href={`/quotes/new?leadId=${lead.id}`}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  + Build New Quote
                </Link>
              )}
            </div>

            {(!lead.quotes || lead.quotes.length === 0) ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No quotes generated yet. Quotes require approved site survey.
              </p>
            ) : (
              <div className="space-y-3">
                {lead.quotes.map((q: any) => (
                  <div key={q.id} className="p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-semibold text-blue-600">{q.quote_number}</span>
                      <span className="text-slate-400 mx-2">•</span>
                      <span>Version {q.version}</span>
                      <span className="text-slate-400 mx-2">•</span>
                      <MoneyText paise={q.total_paise} className="font-bold text-slate-900" />
                    </div>
                    <div className="flex items-center gap-2">
                      <StageChip stage={q.status} />
                      <Link
                        href={`/quotes/${q.id}`}
                        className="p-1 text-slate-400 hover:text-blue-600"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Lead Metadata & Activity Log */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Lead Metadata</h3>
            
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Source:</span>
              <span className="font-semibold text-slate-800">{lead.source}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Sales Owner:</span>
              <span className="font-semibold text-slate-800">{lead.owner?.name || 'Unassigned'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Requested Capacity:</span>
              <span className="font-semibold text-slate-800">{lead.requested_capacity_kw || 3} kW</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Created At:</span>
              <span className="font-semibold text-slate-800">{formatDateIST(lead.created_at)}</span>
            </div>
            {lead.sla_due_at && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">SLA Due:</span>
                <span className="font-semibold text-amber-700">{formatDateTimeIST(lead.sla_due_at)}</span>
              </div>
            )}
          </div>

          {/* Quick Note Input (FR-1.2) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Log Call or Note</h3>
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Log customer conversation, call notes, or remarks..."
                rows={3}
                className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !noteText.trim()}
                className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Send className="w-3 h-3" />
                <span>Add Note</span>
              </button>
            </form>
          </div>

          {/* Activity Timeline (Section 3.5) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Activity History</h3>
            <Timeline events={timelineEvents} />
          </div>
        </div>
      </div>

      {/* Qualification Modal (FR-2.1) */}
      {isQualifyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <span>Site Feasibility Qualification Checklist</span>
              </h2>
              <button type="button" onClick={() => setIsQualifyOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQualifySubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Roof Shadow-Free Area (m²) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={qualifyData.roofAreaSqm}
                    onChange={(e) => setQualifyData({ ...qualifyData, roofAreaSqm: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">Rule: ~10 m² required per 1 kW</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Bill (Rupees)</label>
                  <input
                    type="number"
                    value={qualifyData.monthlyBillRupees}
                    onChange={(e) => setQualifyData({ ...qualifyData, monthlyBillRupees: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sanctioned Load (kW) *</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={qualifyData.sanctionedLoadKw}
                    onChange={(e) => setQualifyData({ ...qualifyData, sanctionedLoadKw: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Grid Phase</label>
                  <select
                    value={qualifyData.phase}
                    onChange={(e) => setQualifyData({ ...qualifyData, phase: e.target.value as any })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="SINGLE">Single Phase</option>
                    <option value="THREE">Three Phase</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <input
                  type="checkbox"
                  id="gridOkCheck"
                  checked={qualifyData.gridOk}
                  onChange={(e) => setQualifyData({ ...qualifyData, gridOk: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="gridOkCheck" className="text-xs font-medium text-slate-800">
                  Grid connection is stable and suitable for net metering
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQualifyOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  Save & Advance to Qualified
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Lead Modal (FR-1.5) */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Close Lead</h2>
            <p className="text-xs text-slate-500 mb-4">Leads cannot be deleted; record the closure reason for reporting.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Closure Status</label>
                <select
                  value={closeStatus}
                  onChange={(e) => setCloseStatus(e.target.value as any)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="LOST">Lost (Competitor / Budget / Changed Mind)</option>
                  <option value="DISQUALIFIED">Disqualified (Unsuitable Roof / No Grid)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Explain why the lead was lost or disqualified..."
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading || !closeReason.trim()}
                  onClick={() => {
                    handleTransition(closeStatus, closeReason);
                    setIsCloseModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs"
                >
                  Confirm Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Review Survey Modal (Phase 2 / S4) */}
      {isReviewSurveyOpen && lead.survey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Review Site Survey (Screen S4)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Surveyor: {lead.survey.surveyor?.name || 'Assigned Surveyor'}</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${lead.survey.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {lead.survey.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div><span className="text-slate-400 block">Roof Type:</span><span className="font-bold text-slate-800">{lead.survey.roof_type || 'RCC_FLAT'}</span></div>
              <div><span className="text-slate-400 block">Azimuth:</span><span className="font-bold text-slate-800">{lead.survey.azimuth_deg}°</span></div>
              <div><span className="text-slate-400 block">Tilt Angle:</span><span className="font-bold text-slate-800">{lead.survey.tilt_deg}°</span></div>
              <div><span className="text-slate-400 block">Usable Area:</span><span className="font-bold text-slate-800">{lead.survey.usable_area_sqm} m²</span></div>
              <div><span className="text-slate-400 block">Shading:</span><span className="font-bold text-slate-800">{lead.survey.shading || 'NONE'}</span></div>
              <div><span className="text-slate-400 block">Cable Distance:</span><span className="font-bold text-slate-800">{lead.survey.cable_distance_m} m</span></div>
              {lead.survey.notes && <div className="col-span-2 mt-2 pt-2 border-t border-slate-200"><span className="text-slate-400 block">Notes:</span><span className="text-slate-700 italic">{lead.survey.notes}</span></div>}
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex justify-between items-center">
              <span>Open mobile survey form:</span>
              <a href={`/tech/survey/${lead.survey.id}`} target="_blank" rel="noreferrer" className="font-bold underline text-blue-700 hover:text-blue-900">
                Open Survey Form →
              </a>
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-slate-700">Rejection Reason (if rejecting):</label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Inadequate roof area or heavy shading"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReviewSurveyOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={reviewLoading}
                  onClick={() => handleReviewSurvey('REJECT')}
                  className="px-4 py-2 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg"
                >
                  Reject Survey
                </button>
                <button
                  type="button"
                  disabled={reviewLoading}
                  onClick={() => handleReviewSurvey('APPROVE')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  {reviewLoading ? 'Processing...' : 'Approve Survey & Sizing'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

