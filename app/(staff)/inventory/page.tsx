import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Package, AlertTriangle, ShieldCheck, Plus, Search, ChevronRight, Layers } from 'lucide-react';
import { MoneyText } from '@/components/MoneyText';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const stockLevels = await prisma.stockLevel.findMany({
    include: {
      product: true,
      location: true,
    },
    orderBy: { product: { category: 'asc' } },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Package className="w-7 h-7 text-blue-600" />
            <span>Inventory & Stock Levels (Screen S11)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Three-state stock quantities: On Hand (physical), Reserved (confirmed orders), Available (On Hand - Reserved). Click any product to drill down into serialized units.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/purchasing/receive"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white font-medium text-sm hover:bg-orange-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Stock</span>
          </Link>
        </div>
      </div>

      {/* Stock Levels Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Product Name & SKU</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3 text-right">On Hand</th>
              <th className="px-4 py-3 text-right">Reserved</th>
              <th className="px-4 py-3 text-right font-bold">Available</th>
              <th className="px-4 py-3 text-right">Reorder Level</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {stockLevels.map((s) => {
              const onHand = Number(s.on_hand);
              const reserved = Number(s.reserved);
              const available = onHand - reserved;
              const reorder = Number(s.product.reorder_level);
              const isLow = available <= reorder;

              return (
                <tr key={`${s.product_id}-${s.location_id}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    <Link
                      href={`/inventory/${s.product_id}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {s.product.name}
                    </Link>
                    <span className="block text-[10px] text-slate-400 font-mono">{s.product.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.product.category}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{s.location.name}</td>
                  <td className="px-4 py-3 text-right font-medium">{onHand} {s.product.uom}</td>
                  <td className="px-4 py-3 text-right text-amber-700 font-medium">{reserved} {s.product.uom}</td>
                  <td className={clsx('px-4 py-3 text-right font-bold text-sm', isLow ? 'text-red-600' : 'text-emerald-700')}>
                    {available} {s.product.uom}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">{reorder} {s.product.uom}</td>
                  <td className="px-4 py-3 text-center">
                    {isLow ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Low Stock</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                        Healthy
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/inventory/${s.product_id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-medium transition-colors"
                    >
                      <Layers className="w-3 h-3 text-slate-500" />
                      <span>Units</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
