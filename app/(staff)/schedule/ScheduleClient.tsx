'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface TechRow {
  user_id: string;
  is_crew_lead: boolean;
  skills: string[];
  leaves: { starts_on: string; ends_on: string }[];
  user: { id: string; name: string; phone: string };
}

interface InstallationRow {
  id: string;
  order_id: string;
  status: string;
  slot: string;
  scheduled_on: string;
  crew_lead_id: string | null;
  crew: { technician_id: string }[];
  order: {
    order_number: string;
    capacity_kw: number;
    system_type: string;
    customer: { name: string; city: string; pincode: string };
  };
}

interface PendingJob {
  id: string;
  order_id: string;
  scheduled_on: string;
  slot: string;
  order: InstallationRow['order'];
}

interface CrewSuggestion {
  leadId: string;
  leadName: string;
  memberIds: string[];
  memberNames: string[];
  crewSize: number;
  breakdown: {
    skillFit: number;
    proximity: number;
    workloadBalance: number;
    siteContinuity: number;
    totalScore: number;
  };
  isRecommended: boolean;
}

export default function ScheduleClient({
  technicians,
  installations,
  pendingJobs,
}: {
  technicians: TechRow[];
  installations: InstallationRow[];
  pendingJobs: PendingJob[];
}) {
  const router = useRouter();

  // Current selected week offset in days
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedJob, setSelectedJob] = useState<PendingJob | null>(pendingJobs[0] || null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Real suggestion state (FR-4.6): fetched from the crew-scorer API
  const [suggestions, setSuggestions] = useState<CrewSuggestion[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string>(
    pendingJobs[0]?.scheduled_on || new Date().toISOString().slice(0, 10)
  );
  const [confirmingLeadId, setConfirmingLeadId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Generate Mon–Sat of the selected week
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);

  const dayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - distanceToMonday);

  const weekDays = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: d,
      dateStr: d.toISOString().slice(0, 10),
      dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      display: formatDateIST(d),
    };
  });

  // Real installations grouped by crew technician × scheduled_on
  const getJobsForCell = (techUserId: string, dateStr: string) => {
    return installations.filter((inst) => {
      if (inst.scheduled_on !== dateStr) return false;
      const isLead = inst.crew_lead_id === techUserId;
      const isMember = inst.crew?.some((m) => m.technician_id === techUserId);
      return isLead || isMember;
    });
  };

  /** Calls the REAL crew suggestion endpoint (domain crew-scoring engine). */
  async function handleSuggestCrew() {
    if (!selectedJob) return;
    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestions(null);
    setConfirmError(null);
    try {
      const date = scheduledDate || selectedJob.scheduled_on;
      const res = await fetch(
        `/api/v1/orders/${selectedJob.order_id}/schedule/suggest?date=${encodeURIComponent(date)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Crew suggestion failed');
      }
      setSuggestions(data.suggestions || []);
      if (!data.suggestions || data.suggestions.length === 0) {
        setSuggestError(
          'No crew satisfies the hard constraints for this date (leave, max 2 jobs/day, crew size, battery skill for off-grid). Try another date.'
        );
      }
    } catch (err: any) {
      setSuggestError(err.message || 'Crew suggestion failed');
    } finally {
      setSuggestLoading(false);
    }
  }

  /** Confirms the crew + date against the real schedule confirm endpoint. */
  async function handleConfirmCrew(suggestion: CrewSuggestion) {
    if (!selectedJob) return;
    setConfirmingLeadId(suggestion.leadId);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/v1/orders/${selectedJob.order_id}/schedule/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewLeadId: suggestion.leadId,
          memberIds: suggestion.memberIds,
          scheduledDate: scheduledDate || selectedJob.scheduled_on,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Schedule confirmation failed');
      }
      setIsDrawerOpen(false);
      setSuggestions(null);
      router.refresh();
    } catch (err: any) {
      setConfirmError(err.message || 'Schedule confirmation failed');
    } finally {
      setConfirmingLeadId(null);
    }
  }

  function handleJobChange(jobId: string) {
    const job = pendingJobs.find((j) => j.id === jobId) || null;
    setSelectedJob(job);
    setSuggestions(null);
    setSuggestError(null);
    setConfirmError(null);
    if (job) setScheduledDate(job.scheduled_on);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <CalendarIcon className="w-7 h-7 text-blue-600" />
            <span>Field Schedule & Crew Grid</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Weekly technician allocation matrix, crew-scoring suggestions (0.40 skill · 0.25 proximity · 0.20 workload · 0.15 continuity) and job status blocks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Week Navigation */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 text-xs">
            <button
              type="button"
              onClick={() => setWeekOffset(weekOffset - 1)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-semibold text-slate-800">
              {weekDays[0].display} – {weekDays[5].display}
            </span>
            <button
              type="button"
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>Crew Suggestions ({pendingJobs.length})</span>
          </button>
        </div>
      </div>

      {/* Weekly Crew Calendar (Mon–Sat × technicians, real installations) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full text-left text-xs border-collapse min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
            <tr>
              <th className="px-4 py-3.5 w-48 border-r border-slate-200">Technician / Crew</th>
              {weekDays.map((d) => (
                <th
                  key={d.dateStr}
                  className="px-3 py-3.5 text-center border-r border-slate-100 last:border-r-0"
                >
                  <span className="block text-[11px] text-slate-400 font-semibold">{d.dayName}</span>
                  <span className="block text-sm text-slate-900 font-bold">{d.date.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {technicians.map((tech) => (
              <tr key={tech.user_id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 border-r border-slate-200 bg-slate-50/30">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>{tech.user?.name}</span>
                    {tech.is_crew_lead && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 uppercase">
                        Lead
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    Skills: {tech.skills?.join(', ') || 'General'}
                  </div>
                </td>

                {weekDays.map((d) => {
                  const cellJobs = getJobsForCell(tech.user_id, d.dateStr);
                  const onLeave = tech.leaves?.some((l) => {
                    return d.dateStr >= l.starts_on && d.dateStr <= l.ends_on;
                  });

                  return (
                    <td
                      key={d.dateStr}
                      className={clsx(
                        'px-2 py-2 border-r border-slate-100 last:border-r-0 align-top h-24 w-36',
                        onLeave && 'bg-slate-100/60'
                      )}
                    >
                      {onLeave ? (
                        <div className="p-1 rounded bg-slate-200/60 text-slate-500 text-[10px] text-center font-medium">
                          On Leave
                        </div>
                      ) : cellJobs.length > 0 ? (
                        <div className="space-y-1">
                          {cellJobs.map((job) => (
                            <Link
                              key={job.id}
                              href={`/orders/${job.order_id}`}
                              className="block p-1.5 rounded bg-blue-50 border border-blue-200 hover:border-blue-400 text-blue-900 transition-colors"
                            >
                              <div className="font-bold text-[10px] truncate">{job.order.order_number}</div>
                              <div className="text-[10px] text-slate-600 truncate">
                                {job.order.customer.name}
                              </div>
                              <div className="text-[9px] font-semibold text-blue-700 mt-0.5">
                                {job.order.capacity_kw} kW {job.status}
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-[10px] text-slate-300">
                          Available
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Crew Suggestions Drawer (FR-4.6 — real scorer, no fabricated data) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <span>Smart Crew Suggestions</span>
              </h2>
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Select Job */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Installation Awaiting Crew
                </label>
                <select
                  value={selectedJob?.id || ''}
                  onChange={(e) => handleJobChange(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                  disabled={pendingJobs.length === 0}
                >
                  {pendingJobs.length === 0 && <option value="">No installations awaiting crew</option>}
                  {pendingJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.order.order_number} — {j.order.customer.name} ({j.order.capacity_kw} kW{' '}
                      {j.order.system_type})
                    </option>
                  ))}
                </select>
              </div>

              {selectedJob && (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Installation Date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => {
                        setScheduledDate(e.target.value);
                        setSuggestions(null);
                      }}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                    <div className="font-semibold text-slate-800">
                      Location: {selectedJob.order.customer.city}, PIN {selectedJob.order.customer.pincode}
                    </div>
                    <div className="text-slate-500">Slot: {selectedJob.slot}</div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSuggestCrew}
                    disabled={suggestLoading}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {suggestLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Scoring crews…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Suggest Crew (real scorer)</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {(suggestError || confirmError) && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{confirmError || suggestError}</span>
                </div>
              )}

              {/* Ranked Suggestions from the API */}
              {suggestions && suggestions.length > 0 && (
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    Top Ranked Crews (weighted 0.40 / 0.25 / 0.20 / 0.15)
                  </span>

                  {suggestions.map((item, index) => (
                    <div
                      key={`${item.leadId}-${item.memberIds.join(',')}`}
                      className={clsx(
                        'p-4 rounded-xl border text-xs space-y-3 transition-all',
                        item.isRecommended
                          ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-300'
                          : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span className="font-bold text-sm text-slate-900">{item.leadName}</span>
                          {item.isRecommended && (
                            <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-extrabold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                          Score: {item.breakdown.totalScore.toFixed(3)}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        Crew of {item.crewSize}: {item.leadName} (lead)
                        {item.memberNames.length > 0 && ` + ${item.memberNames.join(', ')}`}
                      </div>

                      {/* Real score breakdown from the scoring engine */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div>
                          Skill Fit (40%): <strong>{(item.breakdown.skillFit * 100).toFixed(0)}%</strong>
                        </div>
                        <div>
                          Proximity (25%): <strong>{(item.breakdown.proximity * 100).toFixed(0)}%</strong>
                        </div>
                        <div>
                          Workload (20%):{' '}
                          <strong>{(item.breakdown.workloadBalance * 100).toFixed(0)}%</strong>
                        </div>
                        <div>
                          Continuity (15%):{' '}
                          <strong>{(item.breakdown.siteContinuity * 100).toFixed(0)}%</strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={confirmingLeadId !== null}
                        onClick={() => handleConfirmCrew(item)}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        {confirmingLeadId === item.leadId ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Confirming…</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>
                              Confirm {item.leadName} as Lead ({scheduledDate || selectedJob?.scheduled_on})
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {suggestions && suggestions.length === 0 && !suggestLoading && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  No eligible crew for this date. The scoring engine enforces hard constraints: no approved leave,
                  max 2 jobs/day, crew size for capacity, and battery skill for off-grid systems.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
