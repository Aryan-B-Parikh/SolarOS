'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  AlertTriangle,
  Plus,
  Layers,
  SlidersHorizontal,
  ShoppingCart,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';

interface StockRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  isSerialized: boolean;
  locationId: string;
  locationName: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  isLowStock: boolean;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  isSerialized: boolean;
  reorderLevel: number;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

type Tab = 'stock' | 'lowstock' | 'adjustments';

const ADJUST_REASONS = [
  'CUSTOMER_RETURN',
  'DAMAGE',
  'COUNT_CORRECTION',
  'SUPPLIER_RETURN',
  'OTHER',
] as const;

export default function InventoryClient({
  stock,
  products,
  locations,
}: {
  stock: StockRow[];
  products: ProductOption[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('stock');

  // ── Low stock (aggregated per product across locations) ───────────────────
  const lowStockProducts = useMemo(() => {
    const byProduct = new Map<
      string,
      { productId: string; sku: string; name: string; uom: string; available: number; reorderLevel: number }
    >();
    for (const row of stock) {
      const entry = byProduct.get(row.productId) ?? {
        productId: row.productId,
        sku: row.sku,
        name: row.name,
        uom: row.uom,
        available: 0,
        reorderLevel: row.reorderLevel,
      };
      entry.available += row.available;
      byProduct.set(row.productId, entry);
    }
    return Array.from(byProduct.values()).filter((p) => p.available <= p.reorderLevel);
  }, [stock]);

  // ── Adjustment form state (FR-5.7) ────────────────────────────────────────
  const [adjProduct, setAdjProduct] = useState(products[0]?.id || '');
  const [adjLocation, setAdjLocation] = useState(locations[0]?.id || '');
  const [adjQty, setAdjQty] = useState('1');
  const [adjDirection, setAdjDirection] = useState<1 | -1>(1);
  const [adjReasonPreset, setAdjReasonPreset] = useState<string>('COUNT_CORRECTION');
  const [adjReasonNote, setAdjReasonNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const selectedAdjProduct = products.find((p) => p.id === adjProduct);
  const adjustmentReason = adjReasonNote.trim()
    ? `${adjReasonPreset}: ${adjReasonNote.trim()}`
    : adjReasonPreset;

  async function handleAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setAdjustMessage(null);

    const qtyDelta = Number(adjQty);
    if (!adjProduct || !adjLocation) {
      setAdjustMessage({ text: 'Select a product and a location.', type: 'error' });
      return;
    }
    if (!Number.isFinite(qtyDelta) || qtyDelta <= 0) {
      setAdjustMessage({ text: 'Quantity must be greater than zero.', type: 'error' });
      return;
    }

    setAdjusting(true);
    try {
      const res = await fetch('/api/v1/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjProduct,
          locationId: adjLocation,
          qtyDelta: adjDirection * qtyDelta,
          reason: adjustmentReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Adjustment rejected');
      }
      setAdjustMessage({
        text: `Stock adjusted. New on-hand: ${data.onHand} (available ${data.available}). Ledger movement recorded.`,
        type: 'success',
      });
      setAdjQty('1');
      setAdjReasonNote('');
      router.refresh();
    } catch (err: any) {
      setAdjustMessage({ text: err.message || 'Adjustment failed', type: 'error' });
    } finally {
      setAdjusting(false);
    }
  }

  // ── Draft PO creation for low stock (FR-5.8) ──────────────────────────────
  const [poCreating, setPoCreating] = useState<string | 'bulk' | null>(null);
  const [poMessage, setPoMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  async function handleCreateDraftPO(productIds: string[], scope: string | 'bulk') {
    setPoCreating(scope);
    setPoMessage(null);
    try {
      const res = await fetch('/api/v1/purchase-orders/draft-for-low-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Draft PO creation failed');
      }
      setPoMessage({
        text: `Draft PO ${data.poNumber} created with ${data.lines?.length ?? productIds.length} line(s) — review and open it from Purchasing.`,
        type: 'success',
      });
      router.refresh();
    } catch (err: any) {
      setPoMessage({ text: err.message || 'Draft PO creation failed', type: 'error' });
    } finally {
      setPoCreating(null);
    }
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'stock', label: 'Stock Levels', icon: <Package className="w-4 h-4" /> },
    {
      key: 'lowstock',
      label: 'Low Stock',
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: lowStockProducts.length,
    },
    { key: 'adjustments', label: 'Adjustments', icon: <SlidersHorizontal className="w-4 h-4" /> },
  ];

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
            Three-state stock quantities: On Hand (physical), Reserved (confirmed orders), Available (On Hand − Reserved).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/inventory/products"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span>Product Catalogue</span>
          </Link>
          <Link
            href="/purchasing/receive"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white font-medium text-sm hover:bg-orange-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Stock</span>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
              tab === t.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {t.icon}
            <span>{t.label}</span>
            {typeof t.badge === 'number' && t.badge > 0 && (
              <span
                className={clsx(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Stock Levels tab ───────────────────────────────────────────────── */}
      {tab === 'stock' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
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
                {stock.map((s) => (
                  <tr key={`${s.productId}-${s.locationId}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <Link href={`/inventory/${s.productId}`} className="hover:text-blue-600 hover:underline">
                        {s.name}
                      </Link>
                      <span className="block text-[10px] text-slate-400 font-mono">{s.sku}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.category}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{s.locationName}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {s.onHand} {s.uom}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-700 font-medium">
                      {s.reserved} {s.uom}
                    </td>
                    <td
                      className={clsx(
                        'px-4 py-3 text-right font-bold text-sm',
                        s.isLowStock ? 'text-red-600' : 'text-emerald-700'
                      )}
                    >
                      {s.available} {s.uom}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {s.reorderLevel} {s.uom}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.isLowStock ? (
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
                        href={`/inventory/${s.productId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-medium transition-colors"
                      >
                        <Layers className="w-3 h-3 text-slate-500" />
                        <span>Units</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Low Stock tab ──────────────────────────────────────────────────── */}
      {tab === 'lowstock' && (
        <div className="space-y-4">
          {poMessage && (
            <div
              className={clsx(
                'p-3 rounded-xl text-sm font-medium border flex items-center gap-2',
                poMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              )}
            >
              {poMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{poMessage.text}</span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span>Low Stock — Available at or below reorder level ({lowStockProducts.length})</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Availability aggregated across all locations. Draft PO line qty heuristic: reorder level × 2 − available.
                </p>
              </div>
              {lowStockProducts.length > 0 && (
                <button
                  onClick={() =>
                    handleCreateDraftPO(
                      lowStockProducts.map((p) => p.productId),
                      'bulk'
                    )
                  }
                  disabled={poCreating !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 disabled:opacity-50 shadow-xs"
                >
                  {poCreating === 'bulk' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  <span>Create Draft PO for All</span>
                </button>
              )}
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                All products are above their reorder levels.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Available (all locations)</th>
                    <th className="px-4 py-3 text-right">Reorder Level</th>
                    <th className="px-4 py-3 text-right">Suggested PO Qty</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {lowStockProducts.map((p) => {
                    const suggestedQty = Math.max(1, Math.ceil(p.reorderLevel * 2 - p.available));
                    return (
                      <tr key={p.productId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {p.name}
                          <span className="block text-[10px] text-slate-400 font-mono">{p.sku}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">
                          {p.available} {p.uom}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {p.reorderLevel} {p.uom}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">{suggestedQty}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleCreateDraftPO([p.productId], p.productId)}
                            disabled={poCreating !== null}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 text-[11px] font-bold hover:bg-orange-100 disabled:opacity-50"
                          >
                            {poCreating === p.productId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShoppingCart className="w-3.5 h-3.5" />
                            )}
                            <span>Create Draft PO</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Adjustments tab (FR-5.7) ───────────────────────────────────────── */}
      {tab === 'adjustments' && (
        <div className="max-w-2xl space-y-4">
          {adjustMessage && (
            <div
              className={clsx(
                'p-3 rounded-xl text-sm font-medium border flex items-center gap-2',
                adjustMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              )}
            >
              {adjustMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{adjustMessage.text}</span>
            </div>
          )}

          <form
            onSubmit={handleAdjustment}
            className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>Stock Adjustment (audited)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Every adjustment writes an immutable ledger movement and an audit log entry. Reductions below active
                reservations are rejected.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Product *</label>
                <select
                  value={adjProduct}
                  onChange={(e) => setAdjProduct(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Location *</label>
                <select
                  value={adjLocation}
                  onChange={(e) => setAdjLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                  required
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Direction & Quantity ({selectedAdjProduct?.uom || 'units'}) *
                </label>
                <div className="flex gap-2">
                  <div className="flex rounded-xl border border-slate-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAdjDirection(1)}
                      className={clsx(
                        'px-3 py-2 text-xs font-bold transition-colors',
                        adjDirection === 1 ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      + Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjDirection(-1)}
                      className={clsx(
                        'px-3 py-2 text-xs font-bold transition-colors border-l border-slate-300',
                        adjDirection === -1 ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      − Reduce
                    </button>
                  </div>
                  <input
                    type="number"
                    min={1}
                    step="any"
                    value={adjQty}
                    onChange={(e) => setAdjQty(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reason (preset) *</label>
                <select
                  value={adjReasonPreset}
                  onChange={(e) => setAdjReasonPreset(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                >
                  {ADJUST_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reason detail (optional, appended to the preset)
              </label>
              <input
                type="text"
                placeholder="e.g. 2 panels cracked in transit, DC-2026-0412"
                value={adjReasonNote}
                onChange={(e) => setAdjReasonNote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Will record:{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {adjDirection === 1 ? '+' : '−'}
                  {Number(adjQty) || 0} {selectedAdjProduct?.uom || ''} · {adjustmentReason}
                </span>
              </span>
              <button
                type="submit"
                disabled={adjusting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-xs"
              >
                {adjusting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Submit Adjustment</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
