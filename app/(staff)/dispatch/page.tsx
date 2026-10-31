import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { Truck, CheckCircle2, AlertTriangle, ArrowRight, Clock, ShieldCheck, Barcode } from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { formatDateIST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function DispatchPage() {
  const dispatches = await prisma.dispatch.findMany({
    include: {
      order: { include: { customer: true } },
      from_location: true,
      lines: { include: { product: true } },
      units: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Truck className="w-7 h-7 text-blue-600" />
            <span>Warehouse Dispatch Queue (Screen S13)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pick lists, barcode/QR serial scanning, dispatch departure guard, and delivery confirmation.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Order Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Warehouse</th>
              <th className="px-4 py-3 text-center">Lines Fulfilled</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {dispatches.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No dispatches currently in queue. Confirmed orders automatically appear here.
                </td>
              </tr>
            ) : (
              dispatches.map((d) => {
                const totalReq = d.lines.reduce((acc, l) => acc + Number(l.qty_required), 0);
                const totalLoaded = d.lines.reduce((acc, l) => acc + Number(l.qty_loaded), 0);
                const isComplete = totalLoaded >= totalReq && totalReq > 0;

                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">
                      <Link href={`/orders/${d.order_id}`}>
                        {d.order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.order.customer.name}
                      <span className="block text-[11px] text-slate-400">{d.order.customer.city}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{d.from_location.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold text-slate-900">{totalLoaded}</span>
                      <span className="text-slate-400"> / {totalReq} items</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StageChip stage={d.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/orders/${d.order_id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        <span>View Order</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


