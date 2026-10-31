import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { FileText, Plus, ArrowRight, Eye, AlertTriangle } from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';
import { DataTable, Column } from '@/components/DataTable';

export const dynamic = 'force-dynamic';

export default async function QuotesPage() {
  const quotes = await prisma.quote.findMany({
    include: {
      customer: true,
      lead: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-blue-600" />
            <span>Quotations & BOM</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dynamic parts list generation from templates, margin verification, discount guard, and customer share links.
          </p>
        </div>

        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Quotation</span>
        </Link>
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Quote No</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3 text-right">Total Net</th>
              <th className="px-4 py-3">Margin</th>
              <th className="px-4 py-3">Valid Until</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No quotations created yet. Quotes are built from approved site surveys.
                </td>
              </tr>
            ) : (
              quotes.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600">
                    <Link href={`/quotes/${q.id}`} className="hover:underline">
                      {q.quote_number} (v{q.version})
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {q.customer.name}
                    <span className="block text-[11px] text-slate-400 font-normal">{q.customer.phone}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {Number(q.capacity_kw)} kW {q.system_type === 'OFF_GRID' ? 'Off-Grid' : 'On-Grid'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    <MoneyText paise={q.total_paise} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{((q.estimated_margin_bp || 0) / 100).toFixed(1)}%</span>
                      {q.margin_warning && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800" title="Below 20% target margin">
                          Low Margin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateIST(q.valid_until)}
                  </td>
                  <td className="px-4 py-3">
                    <StageChip stage={q.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/api/v1/quotes/${q.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-blue-600"
                        title="View PDF / Print"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      <Link
                        href={`/quotes/${q.id}`}
                        className="p-1 text-slate-400 hover:text-blue-600"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

