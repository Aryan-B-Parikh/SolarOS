'use client';

import React, { useEffect, useState } from 'react';
import {
  Building, Percent, Package, Users, Save, Check,
  AlertTriangle, Loader2, Sparkles
} from 'lucide-react';
import clsx from 'clsx';

/**
 * System Settings (Screen S21, FR-9.2).
 *
 * Loads real values from GET /api/v1/settings and persists changes via
 * PUT /api/v1/settings (DIRECTOR only). Every change is audited server-side
 * (entityType 'setting'). Keys follow prisma/seed.ts naming where seeded:
 * target_margin_bp, sla_hours_by_priority, advance_threshold_percent; the
 * flat company_* keys feed the branded PDF exports.
 */

interface SettingsClientProps {
  initialSettings: any[];
  products: any[];
  templates: any[];
  users: any[];
}

interface SettingsForm {
  company_name: string;
  company_address: string;
  company_gstin: string;
  company_bank_details: string;
  company_phone: string;
  company_email: string;
  target_margin_bp: number;
  advance_threshold_percent: number;
  slaLow: number;
  slaNormal: number;
  slaHigh: number;
  slaUrgent: number;
  ai_assessment_enabled: boolean;
}

type SettingsDto = Record<string, unknown>;

function toForm(dto: SettingsDto): SettingsForm {
  const sla = (dto['sla_hours_by_priority'] as Record<string, unknown>) || {};
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);
  return {
    company_name: str(dto['company_name'], 'SunPower Solar Energy Pvt Ltd'),
    company_address: str(dto['company_address'], ''),
    company_gstin: str(dto['company_gstin'], ''),
    company_bank_details: str(dto['company_bank_details'], ''),
    company_phone: str(dto['company_phone'], ''),
    company_email: str(dto['company_email'], ''),
    target_margin_bp: num(dto['target_margin_bp'], 2000),
    advance_threshold_percent: num(dto['advance_threshold_percent'], 30),
    slaLow: num(sla['LOW'], 168),
    slaNormal: num(sla['NORMAL'], 72),
    slaHigh: num(sla['HIGH'], 24),
    slaUrgent: num(sla['URGENT'], 4),
    ai_assessment_enabled: dto['ai_assessment_enabled'] === true,
  };
}

export default function SettingsClient({
  initialSettings,
  products,
  templates,
  users,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<'COMPANY' | 'BUSINESS' | 'AI' | 'CATALOGUE' | 'USERS'>('COMPANY');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [form, setForm] = useState<SettingsForm>(() =>
    toForm(
      Object.fromEntries(
        (initialSettings || []).map((s: any) => {
          const v = s?.value;
          return [s.key, typeof v === 'object' && v !== null && 'value' in (v as any) ? (v as any).value : v];
        })
      )
    )
  );

  // Load the real managed settings from the API on mount (FR-9.2).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/settings', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error?.message || 'Failed to load settings');
        }
        return res.json();
      })
      .then((data: { settings: SettingsDto }) => {
        if (!cancelled) setForm(toForm(data.settings || {}));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load settings');
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildPayload = () => ({
    settings: {
      company_name: form.company_name,
      company_address: form.company_address,
      company_gstin: form.company_gstin,
      company_bank_details: form.company_bank_details,
      company_phone: form.company_phone,
      company_email: form.company_email,
      target_margin_bp: Number(form.target_margin_bp),
      advance_threshold_percent: Number(form.advance_threshold_percent),
      sla_hours_by_priority: {
        LOW: Number(form.slaLow),
        NORMAL: Number(form.slaNormal),
        HIGH: Number(form.slaHigh),
        URGENT: Number(form.slaUrgent),
      },
      ai_assessment_enabled: form.ai_assessment_enabled,
    },
  });

  // Real save: PUT /api/v1/settings (audited server-side per key).
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to save settings');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error saving settings');
    } finally {
      setLoading(false);
    }
  };

  const textInput = (
    key: keyof SettingsForm,
    label: string,
    opts: { mono?: boolean; placeholder?: string } = {}
  ) => (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <input
        type="text"
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={opts.placeholder}
        className={clsx('w-full p-2.5 text-xs border border-slate-300 rounded-lg', opts.mono && 'font-mono')}
      />
    </div>
  );

  const numberInput = (
    key: keyof SettingsForm,
    label: string,
    opts: { min?: number; max?: number; suffix?: string } = {}
  ) => (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
        {opts.suffix ? <span className="text-slate-400 font-normal"> ({opts.suffix})</span> : null}
      </label>
      <input
        type="number"
        min={opts.min}
        max={opts.max}
        value={Number(form[key])}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
        className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
      />
    </div>
  );

  const saveButton = (label: string) => (
    <button
      type="submit"
      disabled={loading || initializing}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-xs disabled:opacity-60"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Tab Nav */}
      <div className="flex gap-2 border-b border-slate-200 flex-wrap">
        {[
          { key: 'COMPANY', label: 'Company & Branding' },
          { key: 'BUSINESS', label: 'Commercial & Margin Rules' },
          { key: 'AI', label: 'AI Assessment' },
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
          <span>Settings saved successfully! Changes are audited and applied immediately.</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {initializing && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading current settings&hellip;</span>
        </div>
      )}

      {/* Tab: Company & Branding */}
      {activeTab === 'COMPANY' && (
        <form onSubmit={handleSave} className="p-6 bg-white rounded-xl border border-slate-200 space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            Company Information &amp; Quotation Branding
          </h2>

          {textInput('company_name', 'Company Registered Name')}
          {textInput('company_address', 'Official Address')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {textInput('company_gstin', 'GSTIN', { mono: true })}
            {textInput('company_phone', 'Company Phone')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {textInput('company_email', 'Company Email')}
            {textInput('company_bank_details', 'Bank Payment Details')}
          </div>

          {saveButton('Save Company Settings')}
        </form>
      )}

      {/* Tab: Commercial Rules */}
      {activeTab === 'BUSINESS' && (
        <form onSubmit={handleSave} className="p-6 bg-white rounded-xl border border-slate-200 space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Percent className="w-4 h-4 text-blue-600" />
            Commercial &amp; Financial Parameters
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {numberInput('advance_threshold_percent', 'Order Confirmation Advance Threshold', {
              min: 10,
              max: 100,
              suffix: '% - Assumption A2 / Q1',
            })}
            {numberInput('target_margin_bp', 'Target Gross Margin Benchmark', {
              min: 100,
              max: 5000,
              suffix: 'basis points - FR-3.8',
            })}
          </div>
          <p className="text-[11px] text-slate-400">
            Target margin: {(Number(form.target_margin_bp) / 100).toFixed(1)}% - used by the quote
            engine for margin warnings (FR-3.8).
          </p>

          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Ticket SLA Hours by Priority (used by the service desk)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {numberInput('slaUrgent', 'Urgent', { min: 1 })}
              {numberInput('slaHigh', 'High', { min: 1 })}
              {numberInput('slaNormal', 'Normal', { min: 1 })}
              {numberInput('slaLow', 'Low', { min: 1 })}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500">
            Sales maximum discount authority is fixed at 5% by role rules (Q5 / FR-3.4) and cannot be
            changed here; the Director approves larger discounts on the quote screen.
          </div>

          {saveButton('Save Business Rules')}
        </form>
      )}

      {/* Tab: AI Assessment (FR-2.7) */}
      {activeTab === 'AI' && (
        <form onSubmit={handleSave} className="p-6 bg-white rounded-xl border border-slate-200 space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            AI Site Assessment &amp; Photo Analysis
          </h2>

          <label className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={form.ai_assessment_enabled}
              onChange={(e) => setForm({ ...form, ai_assessment_enabled: e.target.checked })}
              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-700">
              <span className="block font-semibold text-slate-900">
                Enable Gemini AI assessment &amp; vision calls (ai_assessment_enabled)
              </span>
              <span className="block text-slate-500 mt-0.5">
                When OFF (default), all AI summaries and photo analyses use the deterministic
                templated fallback and no external AI request is made. When ON, the Gemini API key
                (GEMINI_API_KEY env) is used for customer summaries and advisory survey photo
                analysis - still strictly advisory and zero-PII.
              </span>
            </span>
          </label>

          {saveButton('Save AI Settings')}
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
