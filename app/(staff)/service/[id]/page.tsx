import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTicket } from '@/services/tickets';
import { getSessionUser } from '@/lib/session';
import { StageChip } from '@/components/StageChip';
import { WarrantyBar } from '@/components/WarrantyBar';
import { formatDateIST } from '@/lib/dates';
import { formatPaiseLakhs } from '@/lib/money';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Clock,
  Wrench, CheckCircle2, User, Phone, MapPin, ArrowLeft,
  RefreshCw, FileText
} from 'lucide-react';
import TicketDetailClient from './TicketDetailClient';

export const dynamic = 'force-dynamic';

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  let ticket: any;
  try {
    ticket = await getTicket(params.id);
  } catch (e) {
    notFound();
  }

  // FR-7.7: warranty exclusion is DIRECTOR-only — the client needs the role
  // to decide whether to render the exclusion panel.
  const user = await getSessionUser();

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Back button */}
      <div>
        <Link
          href="/service"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Service Desk</span>
        </Link>
      </div>

      {/* Main Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                {ticket.ticket_number}
              </span>
              <StageChip stage={ticket.status} />
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                ticket.priority === 'URGENT' ? 'bg-red-100 text-red-800' :
                ticket.priority === 'HIGH' ? 'bg-amber-100 text-amber-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {ticket.priority} Priority
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-2">
              {ticket.category.replace('_', ' ')}: {ticket.description}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Created on {formatDateIST(ticket.created_at)} via {ticket.channel}
            </p>
          </div>

          {/* SLA Timer */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-right sm:min-w-[180px]">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-end gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>SLA Due At</span>
            </div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">
              {formatDateIST(ticket.sla_due_at)}
            </div>
          </div>
        </div>

        {/* Warranty Verdict Banner (Rule C9, Screen S18) */}
        <div className={`mt-6 p-4 rounded-xl border flex items-start gap-3.5 ${
          ticket.warranty_verdict === 'IN_WARRANTY'
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : ticket.warranty_verdict === 'OUT_OF_WARRANTY'
            ? 'bg-amber-50/70 border-amber-200 text-amber-900'
            : 'bg-red-50/70 border-red-200 text-red-900'
        }`}>
          {ticket.warranty_verdict === 'IN_WARRANTY' ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">
                Verdict: {ticket.warranty_verdict} ({ticket.billing_mode})
              </span>
              <span className="text-xs font-semibold">
                {ticket.warranty_verdict === 'IN_WARRANTY' ? 'Customer Charge: Rs 0 (Covered)' : 'Customer Charge: Chargeable Parts & Labour'}
              </span>
            </div>
            <p className="text-xs mt-1 opacity-90">
              {ticket.warranty_verdict === 'IN_WARRANTY'
                ? 'Equipment is within the active warranty window. Parts and service labor are covered at zero charge.'
                : 'Warranty expired or excluded. Resolving this ticket will automatically generate a service invoice for parts and labor.'}
            </p>

            {ticket.warranty && (
              <div className="mt-3 pt-3 border-t border-black/10 text-xs flex flex-wrap gap-4">
                <span><strong>Coverage:</strong> {ticket.warranty.coverage}</span>
                <span><strong>Start:</strong> {ticket.warranty.start_date.toISOString().split('T')[0]}</span>
                <span><strong>End:</strong> {ticket.warranty.end_date.toISOString().split('T')[0]}</span>
                <span><strong>Term:</strong> {ticket.warranty.months} Months</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer & Unit Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span>Customer Information</span>
          </h2>
          <div className="space-y-1.5 text-xs">
            <div className="font-semibold text-slate-800 text-sm">{ticket.customer.name}</div>
            <div className="text-slate-600 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>{ticket.customer.phone}</span>
            </div>
            <div className="text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>{ticket.customer.address}, {ticket.customer.city} - {ticket.customer.pincode}</span>
            </div>
          </div>
        </div>

        {/* Equipment Unit Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-600" />
            <span>Equipment / Inverter Details</span>
          </h2>
          {ticket.unit ? (
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-slate-800 text-sm">
                {ticket.unit.product.name} ({ticket.unit.product.brand} {ticket.unit.product.model})
              </div>
              <div className="text-slate-600 flex items-center gap-3">
                <span><strong>Serial:</strong> <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700">{ticket.unit.serial_number}</code></span>
                <span><strong>QR:</strong> <code className="bg-slate-100 px-1 py-0.5 rounded">{ticket.unit.qr_code}</code></span>
              </div>
              <div className="text-slate-500">
                Unit Status: <span className="font-semibold text-slate-700">{ticket.unit.status}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No physical unit linked to this ticket.</div>
          )}
        </div>
      </div>

      {/* Interactive Actions, Replacement & Resolution Client */}
      <TicketDetailClient ticket={ticket} userRole={user?.role || null} />
    </div>
  );
}

