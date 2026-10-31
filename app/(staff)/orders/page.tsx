import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { ShoppingCart, ArrowRight, Clock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: {
      customer: true,
      quote: true,
      lines: true,
      installation: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShoppingCart className="w-7 h-7 text-blue-600" />
            <span>Orders & Fulfillment</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Confirmed projects, 30% advance collection, inventory reservations, dispatch pick lists, and crew schedule.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Order Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3 text-right">Order Total</th>
              <th className="px-4 py-3 text-right">Paid So Far</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Install Date</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No orders found. Orders are created upon customer acceptance of a quotation.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const isPaidFull = o.paid_paise >= o.total_paise;
                const isAdvancePaid = o.paid_paise >= o.advance_required_paise;

                return (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {o.customer.name}
                      <span className="block text-[11px] text-slate-400 font-normal">{o.customer.phone}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {Number(o.capacity_kw)} kW {o.system_type === 'OFF_GRID' ? 'Off-Grid' : 'On-Grid'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <MoneyText paise={o.total_paise} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <MoneyText paise={o.paid_paise} className={isAdvancePaid ? 'text-emerald-700' : 'text-amber-800'} />
                      <span className="block text-[10px] text-slate-400">
                        Adv Req: <MoneyText paise={o.advance_required_paise} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StageChip stage={o.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.installation?.scheduled_on ? formatDateIST(o.installation.scheduled_on) : 'Pending Schedule'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/orders/${o.id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        <span>Open</span>
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

