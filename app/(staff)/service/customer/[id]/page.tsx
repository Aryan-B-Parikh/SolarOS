import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Mail,
  Wrench,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';
import { getCustomerServiceView } from '@/services/search';
import { getFaultCodeCatalogue } from '@/services/tickets';
import { WarrantyBar } from '@/components/WarrantyBar';
import { formatDateIST } from '@/lib/dates';
import { NewTicketButton } from '../../ServiceDeskClient';

export const dynamic = 'force-dynamic';

/**
 * FR-7.2 — staff customer service view (Screen S17 continuation).
 * Uses getCustomerServiceView(): installed units with serials + live warranty
 * bars, customer contact details, installations and tickets.
 */
export default async function CustomerServiceViewPage({ params }: { params: { id: string } }) {
  let view;
  try {
    view = await getCustomerServiceView(params.id);
  } catch {
    notFound();
  }

  const faultCatalogue = await getFaultCodeCatalogue();
  const openTickets = view.tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status));
  const closedTickets = view.tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Back */}
      <div className="flex items-center justify-between">
        <Link
          href="/service"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Service Desk</span>
        </Link>
        <NewTicketButton
          customer={{
            id: view.customer.id,
            name: view.customer.name,
            phone: view.customer.phone,
          }}
          faultCatalogue={faultCatalogue}
          label="Create Ticket"
        />
      </div>

      {/* Customer header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                {view.customer.customerNumber}
              </span>
              <h1 className="text-xl font-bold text-slate-900">{view.customer.name}</h1>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> {view.customer.phone}
              </span>
              {view.customer.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> {view.customer.email}
                </span>
              )}
              <span className="flex items-center gap-1.5 sm:col-span-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {view.customer.address}, {view.customer.city}, {view.customer.state} {view.customer.pincode}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[280px]">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="block text-[10px] uppercase font-bold text-slate-400">Installations</span>
              <span className="text-lg font-black text-slate-800">{view.installations.length}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="block text-[10px] uppercase font-bold text-slate-400">Units</span>
              <span className="text-lg font-black text-slate-800">{view.equipmentWarranties.length}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span className="block text-[10px] uppercase font-bold text-amber-600">Open Tickets</span>
              <span className="text-lg font-black text-amber-800">{openTickets.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Installed equipment with warranty bars (FR-7.2) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-blue-600" />
          <span>Installed Equipment &amp; Warranty Status</span>
        </h2>
        {view.equipmentWarranties.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No serialized equipment with warranty records for this customer yet.
          </p>
        ) : (
          <div className="space-y-3">
            {view.equipmentWarranties.map((w) => (
              <div key={w.warrantyId} className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-bold text-slate-900">{w.productName}</span>
                    <span className="text-slate-400 ml-2">
                      {w.brand} {w.model}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 font-mono">
                      S/N {w.serialNumber} • QR {w.qrCode} • {w.coverage} warranty ({w.totalDays} days)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-bold',
                        w.verdict === 'IN_WARRANTY'
                          ? 'bg-emerald-100 text-emerald-800'
                          : w.verdict === 'OUT_OF_WARRANTY'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      )}
                    >
                      {w.verdict.replace(/_/g, ' ')}
                    </span>
                    <NewTicketButton
                      customer={{
                        id: view.customer.id,
                        name: view.customer.name,
                        phone: view.customer.phone,
                      }}
                      faultCatalogue={faultCatalogue}
                      presetUnitId={w.unitId || null}
                      label="Ticket"
                      className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1"
                    />
                  </div>
                </div>
                <WarrantyBar
                  startDate={w.startDate}
                  endDate={w.endDate}
                  status={w.status as 'ACTIVE' | 'VOID' | 'TRANSFERRED' | 'EXPIRED'}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Installations summary */}
      {view.installations.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Installations</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {view.installations.map((i) => (
              <div key={i.id} className="border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <div className="font-bold text-slate-800">{i.orderNumber}</div>
                <div className="text-slate-500">
                  {i.capacityKw} kW • {i.status.replace(/_/g, ' ')}
                </div>
                <div className="text-[10px] text-slate-400">
                  Scheduled {i.scheduledOn ? formatDateIST(i.scheduledOn) : '—'}
                  {i.signedName ? ` • signed by ${i.signedName}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tickets */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-blue-600" />
          <span>Service Tickets ({openTickets.length} open / {closedTickets.length} resolved)</span>
        </h2>
        {view.tickets.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No service tickets for this customer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="px-3 py-2">Ticket</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Verdict</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {[...openTickets, ...closedTickets].map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                      <Link href={`/service/${t.id}`} className="hover:underline">
                        {t.ticketNumber}
                      </Link>
                      {t.faultCode && (
                        <span className="ml-1.5 font-sans font-mono text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {t.faultCode}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{t.category.replace(/_/g, ' ')}</span>
                      <span className="block text-[10px] text-slate-500 truncate max-w-xs">{t.description}</span>
                    </td>
                    <td className="px-3 py-2.5">{t.priority}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded text-[10px] font-bold',
                          t.warrantyVerdict === 'IN_WARRANTY'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        )}
                      >
                        {t.warrantyVerdict.replace(/_/g, ' ')}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{t.billingMode}</span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{t.status}</td>
                    <td className="px-3 py-2.5 text-slate-500">{formatDateIST(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
