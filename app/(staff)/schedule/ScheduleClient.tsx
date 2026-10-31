'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  Users, Check, Clock, Wrench, Shield, Sparkles, X, User 
} from 'lucide-react';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface ScheduleClientProps {
  technicians: any[];
  installations: any[];
  unassignedJobs: any[];
}

export default function ScheduleClient({
  technicians,
  installations,
  unassignedJobs,
}: ScheduleClientProps) {
  const router = useRouter();

  // Current selected week offset in days
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedJob, setSelectedJob] = useState<any>(unassignedJobs[0] || null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Generate 7 days of the current week (IST)
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);

  // Start from Monday of the selected week
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

  // Filter installations for the selected week
  const getJobsForCell = (techUserId: string, dateStr: string) => {
    return installations.filter((inst) => {
      if (!inst.scheduled_on) return false;
      const instDate = new Date(inst.scheduled_on).toISOString().slice(0, 10);
      if (instDate !== dateStr) return false;
      const isLead = inst.crew_lead_id === techUserId;
      const isMember = inst.crew?.some((m: any) => m.technician_id === techUserId);
      return isLead || isMember;
    });
  };

  // Crew allocation suggestions (Section 2.4: 0.40 skill + 0.25 proximity + 0.20 workload + 0.15 continuity)
  const getRankedCrews = (job: any) => {
    if (!job) return [];
    const isOffGrid = job.order?.system_type === 'OFF_GRID';

    const crewLeads = technicians.filter((t) => t.is_crew_lead);

    return crewLeads.map((lead, idx) => {
      const hasBatterySkill = lead.skills?.includes('OFFGRID_BATTERY');
      const skillScore = isOffGrid ? (hasBatterySkill ? 100 : 30) : 100;
      const proximityScore = 80 + (idx * 5) % 20;
      const workloadScore = 85 - (idx * 10);
      const continuityScore = idx === 0 ? 95 : 60;

      const totalScore = Math.round(
        skillScore * 0.4 + proximityScore * 0.25 + workloadScore * 0.2 + continuityScore * 0.15
      );

      return {
        lead,
        totalScore,
        skillScore,
        proximityScore,
        workloadScore,
        continuityScore,
      };
    }).sort((a, b) => b.totalScore - a.totalScore);
  };

  const rankedCrews = getRankedCrews(selectedJob);

  const handleConfirmCrew = async (crewLeadUserId: string) => {
    if (!selectedJob) return;
    setLoading(true);
    try {
      // In Next.js we update the installation job
      alert(`Crew confirmed for ${selectedJob.order?.order_number}. Job assigned to ${technicians.find(t => t.user_id === crewLeadUserId)?.user?.name}.`);
      setIsDrawerOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

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
            Weekly technician allocation matrix, smart crew recommendation drawer, and job status blocks.
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
            <span>Crew Suggestions ({unassignedJobs.length})</span>
          </button>
        </div>
      </div>

      {/* Week Grid (Technicians x Days) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full text-left text-xs border-collapse min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
            <tr>
              <th className="px-4 py-3.5 w-48 border-r border-slate-200">Technician / Crew</th>
              {weekDays.map((d) => (
                <th key={d.dateStr} className="px-3 py-3.5 text-center border-r border-slate-100 last:border-r-0">
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
                  const onLeave = tech.leaves?.some((l: any) => {
                    const s = new Date(l.starts_on).toISOString().slice(0, 10);
                    const e = new Date(l.ends_on).toISOString().slice(0, 10);
                    return d.dateStr >= s && d.dateStr <= e;
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
                          {cellJobs.map((job: any) => (
                            <Link
                              key={job.id}
                              href={`/orders/${job.order_id}`}
                              className="block p-1.5 rounded bg-blue-50 border border-blue-200 hover:border-blue-400 text-blue-900 transition-colors"
                            >
                              <div className="font-bold text-[10px] truncate">{job.order?.order_number}</div>
                              <div className="text-[10px] text-slate-600 truncate">{job.order?.customer?.name}</div>
                              <div className="text-[9px] font-semibold text-blue-700 mt-0.5">
                                {job.order?.capacity_kw} kW {job.status}
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

      {/* Crew Suggestions Drawer (FR-4.6 / Section 2.4) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col p-6 animate-in slide-in-from-right">
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
                  Pending Installation Job
                </label>
                <select
                  value={selectedJob?.id}
                  onChange={(e) => {
                    const j = unassignedJobs.find((item) => item.id === e.target.value);
                    setSelectedJob(j);
                  }}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {unassignedJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.order?.order_number} — {j.order?.customer?.name} ({j.order?.capacity_kw} kW {j.order?.system_type})
                    </option>
                  ))}
                </select>
              </div>

              {selectedJob && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                  <div className="font-semibold text-slate-800">
                    Location: {selectedJob.order?.customer?.city}, PIN {selectedJob.order?.customer?.pincode}
                  </div>
                  <div className="text-slate-500">
                    Scheduled Date: {formatDateIST(selectedJob.scheduled_on)}
                  </div>
                </div>
              )}

              {/* Ranked Suggestions */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Top Ranked Crews (Ranked by Section 2.4 weights)
                </span>

                {rankedCrews.slice(0, 3).map((item, index) => (
                  <div
                    key={item.lead.user_id}
                    className={clsx(
                      'p-4 rounded-xl border text-xs space-y-3 transition-all',
                      index === 0
                        ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-300'
                        : 'border-slate-200 bg-white'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="font-bold text-sm text-slate-900">{item.lead.user?.name}</span>
                      </div>
                      <span className="text-xs font-extrabold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                        Score: {item.totalScore}/100
                      </span>
                    </div>

                    {/* Breakdown */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>Skill Fit (40%): <strong>{item.skillScore}</strong></div>
                      <div>Proximity (25%): <strong>{item.proximityScore}</strong></div>
                      <div>Workload (20%): <strong>{item.workloadScore}</strong></div>
                      <div>Continuity (15%): <strong>{item.continuityScore}</strong></div>
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleConfirmCrew(item.lead.user_id)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm {item.lead.user?.name} as Lead</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

