'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Search, ShieldCheck, ShieldAlert, Wrench, 
  Clock, User, Phone, CheckCircle2, AlertTriangle, ArrowRight 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { WarrantyBar } from '@/components/WarrantyBar';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface ServiceDeskClientProps {
  initialTickets: any[];
  warranties: any[];
}

export default function ServiceDeskClient({
  initialTickets,
  warranties,
}: ServiceDeskClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tickets, setTickets] = useState(initialTickets);
  const [lookupResult, setLookupResult] = useState<any>(null);

  // Filter tickets by search
  const filteredTickets = tickets.filter((t) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      t.ticket_number?.toLowerCase().includes(s) ||
      t.customer?.name?.toLowerCase().includes(s) ||
      t.customer?.phone?.includes(s) ||
      t.category?.toLowerCase().includes(s)
    );
  });

  const handleQuickLookup = (serial: string) => {
    setSearchTerm(serial);
    if (serial.includes('24A') || serial.includes('2025')) {
      setLookupResult({
        serial: 'INV3K-24A-001873',
        product: 'On-grid inverter 3 kW',
        customer: 'Dr. Anand Desai',
        phone: '+91 90000 00021',
        startDate: '2025-05-05',
        endDate: '2027-05-04',
        daysLeft: 185,
        verdict: 'IN_WARRANTY',
        billingMode: 'WARRANTY (No Charge)',
      });
    } else {
      setLookupResult({
        serial: 'INV3K-22C-000492',
        product: 'On-grid inverter 3 kW',
        customer: 'Kishore Joshi',
        phone: '+91 90000 00030',
        startDate: '2023-03-10',
        endDate: '2025-03-09',
        daysLeft: 0,
        verdict: 'OUT_OF_WARRANTY',
        billingMode: 'CHARGEABLE (Parts & Labour)',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header Bar (Ctrl+K) */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Fast Customer & Serial Number Warranty Search
        </label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer phone (+91...), inverter serial (e.g. INV3K...), name, or ticket number..."
            className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
          />
        </div>

        {/* Demo Scenario Presets (Section 4.4 Demo Flow) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 text-[11px]">Demo Lookups:</span>
          <button
            type="button"
            onClick={() => handleQuickLookup('INV3K-24A-001873')}
            className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium text-[11px] border border-emerald-200"
          >
            Demo 1: May 2025 Customer (In Warranty)
          </button>
          <button
            type="button"
            onClick={() => handleQuickLookup('INV3K-22C-000492')}
            className="px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium text-[11px] border border-amber-200"
          >
            Demo 2: March 2023 Customer (Out of Warranty)
          </button>
        </div>
      </div>

      {/* Warranty Verdict Banner (Section 3.4 / S18) */}
      {lookupResult && (
        <div
          className={clsx(
            'p-5 rounded-xl border text-xs shadow-xs space-y-3 animate-in fade-in',
            lookupResult.verdict === 'IN_WARRANTY'
              ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950'
              : 'border-amber-300 bg-amber-50/70 text-amber-950'
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {lookupResult.verdict === 'IN_WARRANTY' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
              )}
              <h2 className="text-sm font-bold">
                Warranty Verdict: {lookupResult.verdict} — {lookupResult.billingMode}
              </h2>
            </div>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white/80 border border-current">
              {lookupResult.serial}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-lg border border-current/20">
            <div>
              <span className="text-slate-400 block text-[10px]">Customer</span>
              <span className="font-bold text-slate-800 mt-0.5 block">{lookupResult.customer}</span>
              <span className="text-slate-500 text-[10px]">{lookupResult.phone}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Equipment Model</span>
              <span className="font-bold text-slate-800 mt-0.5 block">{lookupResult.product}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Warranty Dates</span>
              <span className="font-medium text-slate-800 mt-0.5 block">
                {lookupResult.startDate} to {lookupResult.endDate}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Days Remaining</span>
              <span className={clsx('font-bold mt-0.5 block text-sm', lookupResult.daysLeft > 0 ? 'text-emerald-700' : 'text-slate-500')}>
                {lookupResult.daysLeft > 0 ? `${lookupResult.daysLeft} Days` : 'Expired'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tickets List */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Breakdown Service Tickets ({filteredTickets.length})</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tickets cannot be closed until customer confirms resolution (C9).</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Ticket No</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Category & Fault</th>
                <th className="px-3 py-2.5">Warranty Verdict</th>
                <th className="px-3 py-2.5">Billing Mode</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">SLA Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No tickets found matching your query.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                      {t.ticket_number}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {t.customer?.name}
                      <span className="block text-[10px] text-slate-400">{t.customer?.phone}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-slate-800">{t.category}</span>
                      <span className="block text-[10px] text-slate-500 truncate max-w-xs">{t.description}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-bold',
                        t.warranty_verdict === 'IN_WARRANTY'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      )}>
                        {t.warranty_verdict}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">
                      {t.billing_mode}
                    </td>
                    <td className="px-3 py-2.5">
                      <StageChip stage={t.status} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {formatDateIST(t.sla_due_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

