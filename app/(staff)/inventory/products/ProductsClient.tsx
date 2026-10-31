'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Plus, Pencil, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';

const CATEGORIES = [
  'SOLAR_PANEL',
  'INVERTER',
  'BATTERY',
  'CHARGE_CONTROLLER',
  'STRUCTURE',
  'CABLE',
  'ACDB',
  'DCDB',
  'EARTHING',
  'LIGHTNING_ARRESTER',
  'CONNECTOR',
  'ACCESSORY',
  'SERVICE',
] as const;

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  uom: string;
  is_serialized: boolean;
  warranty_months: number;
  warranty_start_basis: string;
  rated_power_w: number | null;
  hsn_code: string | null;
  tax_rate_bp: number;
  std_cost_paise: number;
  sale_price_paise: number;
  reorder_level: number;
  monitoring_url: string | null;
  is_active: boolean;
}

type ProductForm = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  uom: string;
  is_serialized: boolean;
  warranty_months: number;
  warranty_start_basis: string;
  rated_power_w: number | null;
  hsn_code: string;
  tax_rate_bp: number;
  stdCostRupees: number;
  salePriceRupees: number;
  reorder_level: number;
  monitoring_url: string;
  is_active: boolean;
};

const EMPTY_FORM: ProductForm = {
  sku: '',
  name: '',
  category: 'SOLAR_PANEL',
  brand: '',
  model: '',
  uom: 'NOS',
  is_serialized: false,
  warranty_months: 12,
  warranty_start_basis: 'DELIVERY',
  rated_power_w: null,
  hsn_code: '',
  tax_rate_bp: 1800,
  stdCostRupees: 0,
  salePriceRupees: 0,
  reorder_level: 0,
  monitoring_url: '',
  is_active: true,
};

function formFromProduct(p: ProductRow): ProductForm {
  return {
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand || '',
    model: p.model || '',
    uom: p.uom || 'NOS',
    is_serialized: p.is_serialized,
    warranty_months: p.warranty_months,
    warranty_start_basis: p.warranty_start_basis,
    rated_power_w: p.rated_power_w,
    hsn_code: p.hsn_code || '',
    tax_rate_bp: p.tax_rate_bp,
    stdCostRupees: p.std_cost_paise / 100,
    salePriceRupees: p.sale_price_paise / 100,
    reorder_level: p.reorder_level,
    monitoring_url: p.monitoring_url || '',
    is_active: p.is_active,
  };
}

export default function ProductsClient() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  async function loadProducts() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/products?includeInactive=${showInactive}${categoryFilter !== 'ALL' ? `&category=${categoryFilter}` : ''}`
      );
      if (res.ok) {
        setProducts(await res.json());
      }
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, showInactive]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    setModalOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditingId(p.id);
    setForm(formFromProduct(p));
    setMessage(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim(),
      model: form.model.trim(),
      uom: form.uom.trim() || 'NOS',
      is_serialized: form.is_serialized,
      warranty_months: Number(form.warranty_months) || 0,
      warranty_start_basis: form.warranty_start_basis,
      rated_power_w: form.rated_power_w ? Number(form.rated_power_w) : null,
      hsn_code: form.hsn_code.trim() || null,
      tax_rate_bp: Number(form.tax_rate_bp) || 1800,
      std_cost_paise: Math.round(Number(form.stdCostRupees || 0) * 100),
      sale_price_paise: Math.round(Number(form.salePriceRupees || 0) * 100),
      reorder_level: Number(form.reorder_level) || 0,
      monitoring_url: form.monitoring_url.trim() || null,
      is_active: form.is_active,
    };

    try {
      const res = await fetch(editingId ? `/api/v1/products/${editingId}` : '/api/v1/products', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Save failed');
      }
      setModalOpen(false);
      setMessage({
        text: editingId ? `Product ${data.sku} updated.` : `Product ${data.sku} created.`,
        type: 'success',
      });
      await loadProducts();
    } catch (err: any) {
      setMessage({ text: err.message || 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const filtered =
    categoryFilter === 'ALL' ? products : products.filter((p) => p.category === categoryFilter);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mb-1"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Inventory</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Package className="w-7 h-7 text-blue-600" />
            <span>Product Catalogue (FR-5.1)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            SKU master data: serialisation, warranty terms, HSN/tax, costs and reorder levels. All changes are audited.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Product</span>
        </button>
      </div>

      {message && (
        <div
          className={clsx(
            'p-3 rounded-xl text-sm font-medium border flex items-center gap-2',
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          )}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
        >
          <option value="ALL">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span>Show inactive</span>
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading products…</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">SKU / Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-center">Serialized</th>
                  <th className="px-4 py-3 text-center">Warranty</th>
                  <th className="px-4 py-3 text-right">Std Cost</th>
                  <th className="px-4 py-3 text-right">Sale Price</th>
                  <th className="px-4 py-3 text-right">Reorder</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      No products found. Click &quot;New Product&quot; to add your first catalogue item.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className={clsx('hover:bg-slate-50', !p.is_active && 'opacity-60')}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {p.name}
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {p.sku} · {p.brand || '—'} {p.model || ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.category}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded text-[10px] font-bold',
                            p.is_serialized ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {p.is_serialized ? 'SERIALIZED' : 'BULK'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {p.warranty_months} mo
                        <span className="block text-[9px] text-slate-400">
                          {p.warranty_start_basis === 'DELIVERY' ? 'from delivery' : 'from sign-off'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        Rs {(p.std_cost_paise / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        Rs {(p.sale_price_paise / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{p.reorder_level}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded text-[10px] font-semibold',
                            p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'
                          )}
                        >
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-medium"
                        >
                          <Pencil className="w-3 h-3 text-slate-500" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                {editingId ? `Edit Product — ${form.sku}` : 'New Product'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    required
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">UOM</label>
                  <input
                    type="text"
                    value={form.uom}
                    onChange={(e) => setForm({ ...form, uom: e.target.value })}
                    placeholder="NOS / METER / SET"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_serialized}
                    onChange={(e) => setForm({ ...form, is_serialized: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span>Serialized</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span>Active</span>
                </label>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Warranty (mo)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.warranty_months}
                    onChange={(e) => setForm({ ...form, warranty_months: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start basis</label>
                  <select
                    value={form.warranty_start_basis}
                    onChange={(e) => setForm({ ...form, warranty_start_basis: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="DELIVERY">Delivery</option>
                    <option value="INSTALLATION_SIGNOFF">Installation sign-off</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Std cost (Rs)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.stdCostRupees}
                    onChange={(e) => setForm({ ...form, stdCostRupees: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sale price (Rs)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.salePriceRupees}
                    onChange={(e) => setForm({ ...form, salePriceRupees: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reorder level</label>
                  <input
                    type="number"
                    min={0}
                    value={form.reorder_level}
                    onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax rate (bp)</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={form.tax_rate_bp}
                    onChange={(e) => setForm({ ...form, tax_rate_bp: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">HSN code</label>
                  <input
                    type="text"
                    value={form.hsn_code}
                    onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rated power (W)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.rated_power_w ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, rated_power_w: e.target.value ? Number(e.target.value) : null })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monitoring URL</label>
                  <input
                    type="url"
                    value={form.monitoring_url}
                    onChange={(e) => setForm({ ...form, monitoring_url: e.target.value })}
                    placeholder="https://"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingId ? 'Save Changes' : 'Create Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
