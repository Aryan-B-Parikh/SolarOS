'use client';

import React, { useState } from 'react';
import { 
  Building, Percent, Package, Users, Save, Check 
} from 'lucide-react';
import clsx from 'clsx';

interface SettingsClientProps {
  initialSettings: any[];
  products: any[];
  templates: any[];
  users: any[];
}

export default function SettingsClient({
  initialSettings,
  products,
  templates,
  users,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<'BRANDING' | 'RULES' | 'CATALOGUE' | 'USERS'>('BRANDING');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    companyName: 'SunPower Solar Systems Pvt Ltd',
    companyAddress: '401 SunPower Tower, SG Highway, Ahmedabad, Gujarat 380054',
    companyGstin: '24AAACS1429B1Z8',
    companyBank: 'HDFC Bank, A/C: 50200012345678, IFSC: HDFC0000123',
    advancePercent: 30,
    targetMarginPercent: 20,
    salesDiscountLimit: 5,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Tab Nav */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { key: 'BRANDING', label: 'Company & Branding' },
          { key: 'RULES', label: 'Commercial & Margin Rules' },
          { key: 'CATALOGUE', label: `Catalogue Products (${products.length})` },
          { key: 'USERS', label: `Staff & Users (${users.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={clsx(
              'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all',
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {saved && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Settings saved successfully!</span>
        </div>
      )}

      {/* Tab: Branding */}
      {activeTab === 'BRANDING' && (
        <form onSubmit={handleSave} className="p-6 bg-white rounded-xl border border-slate-200 space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900">Company Information & Quotation Branding</h2>
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Company Registered Name</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Official Address</label>
            <input
              type="text"
              value={form.companyAddress}
              onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">GSTIN</label>
              <input
                type="text"
                value={form.companyGstin}
                onChange={(e) => setForm({ ...form, companyGstin: e.target.value })}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Payment Details</label>
              <input
                type="text"
                value={form.companyBank}
                onChange={(e) => setForm({ ...form, companyBank: e.target.value })}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>Save Branding</span>
          </button>
        </form>
      )}

      {/* Tab: Commercial Rules */}
      {activeTab === 'RULES' && (
        <form onSubmit={handleSave} className="p-6 bg-white rounded-xl border border-slate-200 space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900">Commercial & Financial Parameters</h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Order Confirmation Advance Threshold (%) (Default: 30% - Assumption A2 / Q1)
            </label>
            <input
              type="number"
              min={10}
              max={100}
              value={form.advancePercent}
              onChange={(e) => setForm({ ...form, advancePercent: Number(e.target.value) })}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Gross Margin Benchmark (%) (Default: 20% - FR-3.8)
            </label>
            <input
              type="number"
              min={5}
              max={50}
              value={form.targetMarginPercent}
              onChange={(e) => setForm({ ...form, targetMarginPercent: Number(e.target.value) })}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sales Maximum Discount Authority (%) (Default: 5% - Q5 / FR-3.4)
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={form.salesDiscountLimit}
              onChange={(e) => setForm({ ...form, salesDiscountLimit: Number(e.target.value) })}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>Save Rules</span>
          </button>
        </form>
      )}

      {/* Tab: Catalogue Products */}
      {activeTab === 'CATALOGUE' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Serialized</th>
                <th className="px-4 py-3">Warranty</th>
                <th className="px-4 py-3">Start Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-bold text-slate-700">{p.sku}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.category}</td>
                  <td className="px-4 py-3">
                    {p.is_serialized ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                        Serialized
                      </span>
                    ) : (
                      <span className="text-slate-400">Bulk</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {p.warranty_months > 0 ? `${p.warranty_months / 12} Years (${p.warranty_months}m)` : 'None'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                    {p.warranty_start_basis}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Users & Roles */}
      {activeTab === 'USERS' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="text-slate-400">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

