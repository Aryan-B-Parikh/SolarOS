import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { buildMapUrl } from '@/lib/map';
import {
  Wrench,
  Calendar,
  MapPin,
  Phone,
  Sun,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { OfflineBanner } from '@/components/OfflineBanner';

export const dynamic = 'force-dynamic';

export default async function TechJobsPage() {
  const user = await getSessionUser();
  const isTech = user?.role === 'TECHNICIAN';

  const installations = await prisma.installation.findMany({
    where: isTech
      ? {
          OR: [
            { crew_lead_id: user!.id },
            { crew: { some: { technician_id: user!.id } } },
          ],
        }
      : {},
    include: {
      order: {
        include: {
          customer: true,
        },
      },
      crew_lead: {
        select: { id: true, name: true, phone: true },
      },
    },
    orderBy: { scheduled_on: 'desc' },
  });

  return (
    <div className="max-w-md mx-auto space-y-4 pb-24 pt-2 px-3">
      <OfflineBanner />

      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-600" />
          <span>Assigned Installation Jobs</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Complete history and scheduled pipeline of rooftop installation projects.
        </p>
      </div>

      {/* List */}
      <div className="space-y-3">
        {installations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 text-xs">
            No installation jobs assigned to your crew.
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
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                      {inst.order?.order_number || 'JOB'}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 mt-1">
                      {customer?.name || 'Customer Site'}
                    </h2>
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
                    <span className="flex-1">{customer?.address}, {customer?.city}</span>
                  </div>
                  <a
                    href={buildMapUrl(customer?.address, customer?.city, customer?.pincode)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-orange-600 font-semibold hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Open in Maps</span>
                  </a>
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
                    <span>System Capacity: {Number(inst.installed_capacity_kw || 3.24)} kW</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Scheduled: {inst.scheduled_on.toISOString().split('T')[0]}</span>
                  </div>
                </div>

                <Link
                  href={`/tech/jobs/${inst.id}`}
                  className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{isFinished ? 'Review Handover Details' : 'Open Installation Stepper'}</span>
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
