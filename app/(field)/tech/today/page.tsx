import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Wrench,
  FileCheck2,
  ArrowRight,
  Sun,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { OfflineBanner } from '@/components/OfflineBanner';

export const dynamic = 'force-dynamic';

export default async function TechTodayPage() {
  const [installations, surveys] = await Promise.all([
    prisma.installation.findMany({
      include: {
        order: {
          include: {
            customer: true,
          },
        },
        crew_lead: true,
      },
      orderBy: { scheduled_on: 'asc' },
      take: 20,
    }),
    prisma.siteSurvey.findMany({
      include: {
        lead: true,
        surveyor: true,
      },
      orderBy: { scheduled_at: 'asc' },
      take: 20,
    }),
  ]);

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="max-w-md mx-auto space-y-4 pb-24 pt-2 px-3">
      <OfflineBanner />

      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-center gap-2 text-xs font-semibold text-orange-100 uppercase tracking-wider">
          <Calendar className="w-4 h-4" />
          <span>{todayStr}</span>
        </div>
        <h1 className="text-2xl font-black mt-1">Field Operations</h1>
        <p className="text-xs text-orange-100 mt-1">
          {installations.length} Installation(s) · {surveys.length} Site Survey(s) Scheduled
        </p>
      </div>

      {/* Installations Section */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 px-1">
          <Wrench className="w-4 h-4 text-orange-600" />
          <span>Rooftop Installations ({installations.length})</span>
        </h2>

        {installations.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center border border-slate-200 text-slate-400 text-xs">
            No installation jobs currently scheduled for today.
          </div>
        ) : (
          installations.map((inst) => {
            const customer = inst.order?.customer;
            const isFinished = inst.status === 'COMPLETED';

            return (
              <div
                key={inst.id}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-mono">
                      {inst.order?.order_number || 'JOB'}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {customer?.name || 'Customer Site'}
                    </h3>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      isFinished
                        ? 'bg-emerald-100 text-emerald-800'
                        : inst.status === 'IN_PROGRESS'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {inst.status}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{customer?.address_line1}, {customer?.city}</span>
                  </div>
                  {customer?.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a href={`tel:${customer.phone}`} className="text-orange-600 font-semibold hover:underline">
                        {customer.phone}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>System Size: {Number(inst.installed_capacity_kw || 3)} kW</span>
                  </div>
                </div>

                <Link
                  href={`/tech/jobs/${inst.id}`}
                  className="w-full min-h-[48px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{isFinished ? 'View Completed Job' : 'Open Installation Stepper'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })
        )}
      </div>

      {/* Surveys Section */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 px-1">
          <FileCheck2 className="w-4 h-4 text-blue-600" />
          <span>Site Surveys ({surveys.length})</span>
        </h2>

        {surveys.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center border border-slate-200 text-slate-400 text-xs">
            No pending surveys scheduled.
          </div>
        ) : (
          surveys.map((survey) => {
            const lead = survey.lead;
            const isApproved = survey.status === 'APPROVED';

            return (
              <div
                key={survey.id}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{lead?.name || 'Lead Site'}</h3>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{lead?.city} · Monthly Bill Rs. {lead?.monthly_bill_inr || '-'}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      isApproved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {survey.status}
                  </span>
                </div>

                <Link
                  href={`/tech/survey/${survey.id}`}
                  className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{isApproved ? 'Review Survey Form' : 'Fill Mobile Site Survey'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
