'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Package, 
  QrCode, 
  Search, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Wrench, 
  AlertOctagon, 
  ExternalLink,
  ShieldAlert,
  Layers
} from 'lucide-react';
import { MoneyText } from '@/components/MoneyText';

interface UnitItem {
  id: string;
  serial_number: string;
  qr_code: string;
  status: string;
  unit_cost_paise: number;
  delivered_on: string | null;
  location: { id: string; name: string };
  order: { id: string; order_number: string } | null;
  customer: { id: string; name: string; phone: string } | null;
  created_at: string;
}

interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  uom: string;
  is_serialized: boolean;
  reorder_level: number;
}

interface StockLevelItem {
  locationName: string;
  locationCode: string;
  onHand: number;
  reserved: number;
  available: number;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  IN_STOCK: { label: 'In Stock', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2 },
  RESERVED: { label: 'Reserved', bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', icon: Clock },
  DISPATCHED: { label: 'Dispatched', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', icon: Truck },
  DELIVERED: { label: 'Delivered', bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700', icon: CheckCircle2 },
  INSTALLED: { label: 'Installed', bg: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-700', icon: Wrench },
  RMA: { label: 'RMA / Defective', bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', icon: AlertOctagon },
  SCRAPPED: { label: 'Scrapped', bg: 'bg-slate-100 text-slate-700 border-slate-300', text: 'text-slate-700', icon: ShieldAlert },
};

export default function UnitDrilldownClient({
  product,
  stockLevels,
  units,
}: {
  product: ProductDetail;
  stockLevels: StockLevelItem[];
  units: UnitItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredUnits = units.filter((u) => {
    const matchesSearch = 
      u.serial_number.toLowerCase().includes(search.toLowerCase()) ||
      u.qr_code.toLowerCase().includes(search.toLowerCase()) ||
      (u.order && u.order.order_number.toLowerCase().includes(search.toLowerCase())) ||
      (u.customer && u.customer.name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOnHand = stockLevels.reduce((acc, s) => acc + s.onHand, 0);
  const totalReserved = stockLevels.reduce((acc, s) => acc + s.reserved, 0);
  const totalAvailable = stockLevels.reduce((acc, s) => acc + s.available, 0);

  const statusCounts = units.reduce((acc, u) => {
    acc[u.status] = (acc[u.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Breadcrumb & Nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/inventory')}
          className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
          title="Back to Inventory"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              {product.category}
            </span>
            <span className="text-xs text-slate-500 font-mono">SKU: {product.sku}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            {product.name}
          </h1>
        </div>
      </div>

      {/* Aggregate Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Physical On Hand</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalOnHand} {product.uom}</div>
          <div className="text-xs text-slate-400 mt-1">Across all locations</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Reserved</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{totalReserved} {product.uom}</div>
          <div className="text-xs text-slate-400 mt-1">Allocated to confirmed orders</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Available to Sell</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{totalAvailable} {product.uom}</div>
          <div className="text-xs text-slate-400 mt-1">On Hand − Reserved</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Tracked Units</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{units.length}</div>
          <div className="text-xs text-slate-400 mt-1">Serialized units in system</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search serial, QR, order, or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({units.length})
            </button>
            {Object.keys(STATUS_CONFIG).map((status) => {
              const count = statusCounts[status] || 0;
              if (count === 0 && status !== 'IN_STOCK' && status !== 'INSTALLED') return null;
              const cfg = STATUS_CONFIG[status];
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Units Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <span>Serialized Units ({filteredUnits.length})</span>
          </h2>
          <span className="text-xs text-slate-500">Screen S11 Unit Drill-down</span>
        </div>

        {filteredUnits.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium">No units found matching criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Serial Number</th>
                  <th className="px-4 py-3">QR Code</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Assigned Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Cost (Rs.)</th>
                  <th className="px-4 py-3 text-center">Warranty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUnits.map((u) => {
                  const statusMeta = STATUS_CONFIG[u.status] || {
                    label: u.status,
                    bg: 'bg-slate-100 text-slate-700 border-slate-200',
                    text: 'text-slate-700',
                    icon: Package,
                  };
                  const StatusIcon = statusMeta.icon;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {u.serial_number}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.qr_code}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${statusMeta.bg}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          <span>{statusMeta.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {u.location.name}
                      </td>
                      <td className="px-4 py-3">
                        {u.order ? (
                          <Link
                            href={`/orders/${u.order.id}`}
                            className="text-blue-600 hover:underline font-mono"
                          >
                            {u.order.order_number}
                          </Link>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.customer ? (
                          <div>
                            <div className="font-medium text-slate-900">{u.customer.name}</div>
                            <div className="text-[11px] text-slate-400">{u.customer.phone}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <MoneyText paise={u.unit_cost_paise} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/w/${u.qr_code}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px] font-medium transition-colors"
                        >
                          <span>Public QR</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
