'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  FileText, Sparkles, AlertTriangle, ShieldCheck, 
  Send, Save, ArrowLeft, Check, CheckCircle2, Info
} from 'lucide-react';
import { formatPaise } from '@/lib/money';
import clsx from 'clsx';

interface QuoteBuilderClientProps {
  leads: any[];
  templates: any[];
  initialLeadId?: string;
}

export default function QuoteBuilderClient({
  leads,
  templates,
  initialLeadId,
}: QuoteBuilderClientProps) {
  const router = useRouter();

  const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId || leads[0]?.id || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [discountRupees, setDiscountRupees] = useState<number>(0);
  const [validDays, setValidDays] = useState<number>(15);
  const [loading, setLoading] = useState(false);

  // Selected lead details
  const selectedLead = leads.find((l) => l.id === selectedLeadId);
  const surveyApproved = selectedLead?.status === 'SURVEY_APPROVED' || selectedLead?.status === 'QUOTED';

  // Pre-select template based on assessment or lead preference
  useEffect(() => {
    if (templates.length === 0) return;
    const recKw = Number(selectedLead?.assessment?.recommended_kw) || Number(selectedLead?.requested_capacity_kw) || 3;
    const recType = selectedLead?.assessment?.recommended_type || selectedLead?.system_type_pref || 'ON_GRID';

    const match = templates.find((t) => Number(t.capacity_kw) === recKw && t.system_type === recType);
    if (match) {
      setSelectedTemplateId(match.id);
    } else {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedLeadId, templates]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Calculate BOM preview client-side
  const calculateBomClient = () => {
    if (!selectedTemplate) return { lines: [], subtotal: 0n, totalCost: 0n, panelCount: 0 };

    const capacityKw = Number(selectedTemplate.capacity_kw);
    const panelRatedWp = 540;
    const cableDistanceM = selectedLead?.survey?.cable_distance_m ? Number(selectedLead.survey.cable_distance_m) : Number(selectedTemplate.default_cable_distance_m);

    const panelCount = Math.ceil((capacityKw * 1000) / panelRatedWp);

    let subtotal = 0n;
    let totalCost = 0n;

    const lines = selectedTemplate.bom_lines.map((l: any) => {
      let qty = Number(l.value);
      if (l.rule === 'PANEL_COUNT') qty = panelCount;
      else if (l.rule === 'PER_PANEL') qty = Number(l.value) * panelCount;
      else if (l.rule === 'PER_KW') qty = Math.ceil(Number(l.value) * capacityKw);
      else if (l.rule === 'PER_CABLE_METER') qty = Math.ceil(Number(l.value) * cableDistanceM + Number(l.allowance || 0));

      const unitPrice = BigInt(l.product.sale_price_paise);
      const unitCost = BigInt(l.product.std_cost_paise);
      const lineTotal = BigInt(Math.round(qty * Number(unitPrice)));
      const lineCost = BigInt(Math.round(qty * Number(unitCost)));

      subtotal += lineTotal;
      totalCost += lineCost;

      return {
        ...l,
        calculatedQty: qty,
        unitPrice,
        lineTotal,
        lineCost,
      };
    });

    return { lines, subtotal, totalCost, panelCount, cableDistanceM };
  };

  const bom = calculateBomClient();
  const subtotalPaise = bom.subtotal;
  const discountPaise = BigInt(Math.round(discountRupees * 100));
  const netPricePaise = subtotalPaise - discountPaise;
  const discountPercent = Number(subtotalPaise > 0n ? (discountPaise * 100n) / subtotalPaise : 0n);

  // Tax 18%
  const taxPaise = BigInt(Math.round((Number(netPricePaise) * 1800) / 10000));
  const totalPaise = netPricePaise + taxPaise;

  // Margin calculation
  const labourPaise = BigInt(selectedTemplate?.labour_allowance_paise || 0);
  const estimatedMarginPaise = netPricePaise - bom.totalCost - labourPaise;
  const marginBp = netPricePaise > 0n ? Math.round((Number(estimatedMarginPaise) / Number(netPricePaise)) * 10000) : 0;
  const marginPercent = Number((marginBp / 100).toFixed(1));
  const marginWarning = marginBp < 2000; // < 20%

  // Subsidy estimate
  const capacityKw = Number(selectedTemplate?.capacity_kw || 3);
  const subsidyPaise = selectedLead?.wants_subsidy ? (capacityKw >= 3 ? 7800000n : capacityKw >= 2 ? 6000000n : 3000000n) : 0n;

  const handleCreateQuote = async (sendImmediately = false) => {
    if (discountPercent > 5) {
      alert(`Discount of ${discountPercent}% exceeds 5% sales limit. Requires Director authorization.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'SALES',
        },
        body: JSON.stringify({
          leadId: selectedLeadId,
          templateId: selectedTemplateId,
          capacityKw: Number(selectedTemplate.capacity_kw),
          cableDistanceM: bom.cableDistanceM,
          discountRupees: Number(discountRupees),
          validDays: Number(validDays),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error?.message || 'Failed to create quote');
        return;
      }

      const { quote } = await res.json();

      if (sendImmediately) {
        const sendRes = await fetch(`/api/v1/quotes/${quote.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!sendRes.ok) {
          const sendErr = await sendRes.json();
          alert(sendErr.error?.message || 'Saved draft, but failed to send link');
        } else {
          alert('Quote successfully created and sent to customer via secure link!');
        }
      }

      router.push(`/quotes/${quote.id}`);
    } catch (err: any) {
      alert(err.message || 'Error building quote');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/quotes" className="hover:text-blue-600">Quotes</Link>
            <span>/</span>
            <span className="font-semibold text-slate-900">Builder</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>Build Quotation & BOM</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/quotes"
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleCreateQuote(false)}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Save Draft</span>
          </button>
          <button
            type="button"
            disabled={loading || !surveyApproved}
            onClick={() => handleCreateQuote(true)}
            className={clsx(
              'px-4 py-2 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5 shadow-sm transition-all',
              surveyApproved ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'
            )}
            title={!surveyApproved ? 'Survey must be approved before quotation can be sent' : 'Send to Customer'}
          >
            <Send className="w-4 h-4" />
            <span>Send Quote to Customer</span>
          </button>
        </div>
      </div>

      {/* Survey Status Warning if not approved (FR-2.4) */}
      {!surveyApproved && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 text-xs text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Quotation Sending Locked (SURVEY_NOT_APPROVED)</p>
            <p className="mt-0.5 text-amber-800">
              According to business rule FR-2.4, a quote cannot be sent until the rooftop survey is formally approved by a sales manager or engineer. You may still save a draft.
            </p>
          </div>
        </div>
      )}

      {/* Lead Selection Card */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Select Target Lead
        </label>
        <select
          value={selectedLeadId}
          onChange={(e) => setSelectedLeadId(e.target.value)}
          className="w-full sm:w-1/2 p-2.5 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lead_number} — {l.customer.name} ({l.customer.phone}) • Status: {l.status}
            </option>
          ))}
        </select>
      </div>

      {/* System Templates Grid (1 to 5 kW On-Grid & Off-Grid) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Choose System Template</h2>
          <span className="text-xs text-slate-500">Includes complete dynamic BOM & labour allowance</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {templates.map((tpl) => {
            const isSelected = tpl.id === selectedTemplateId;
            const isRec = Number(selectedLead?.assessment?.recommended_kw) === Number(tpl.capacity_kw);

            return (
              <button
                type="button"
                key={tpl.id}
                onClick={() => setSelectedTemplateId(tpl.id)}
                className={clsx(
                  'p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between h-28',
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                {isRec && (
                  <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
                    Recommended
                  </span>
                )}
                <div>
                  <span className="font-bold text-base text-slate-900 block">
                    {tpl.capacity_kw} kW
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 block">
                    {tpl.system_type === 'OFF_GRID' ? 'Off-Grid (Battery)' : 'On-Grid Net Meter'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Code: {tpl.code}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* BOM Dynamic Line Items Table (FR-3.1 / TRD 2.4) */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Generated Bill of Materials (BOM)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Based on {bom.panelCount} panels (540 Wp) and {bom.cableDistanceM}m cable run
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {bom.lines.length} Line Items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Rule Badge</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Unit Rate</th>
                <th className="px-3 py-2.5 text-right">GST</th>
                <th className="px-3 py-2.5 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {bom.lines.map((l: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">
                    {l.product.name}
                    <span className="block text-[10px] text-slate-400 font-mono">{l.product.sku}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {l.rule}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                    {l.calculatedQty} {l.product.uom}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatPaise(l.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {(l.product.tax_rate_bp / 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900 tabular-nums">
                    {formatPaise(l.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pricing, Discount, Margin & Subsidy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Discounts & Validity */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Discounts & Validity Parameters</h3>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="font-semibold text-slate-700">Special Discount (Rupees)</label>
                <span className={clsx('font-bold', discountPercent > 5 ? 'text-red-600' : 'text-slate-500')}>
                  {discountPercent}% of Subtotal (Max 5% Sales Authority)
                </span>
              </div>
              <input
                type="number"
                min={0}
                value={discountRupees}
                onChange={(e) => setDiscountRupees(Number(e.target.value))}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {discountPercent > 5 && (
                <p className="text-[11px] font-medium text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Discount &gt; 5% requires Director sign-off before quotation release.</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quote Validity (Days)</label>
              <input
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value))}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Margin Indicator Banner (FR-3.8) */}
            <div className={clsx('p-3 rounded-lg border text-xs', marginWarning ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>
              <div className="flex items-center justify-between font-bold">
                <span>Estimated Gross Margin:</span>
                <span className="text-sm">{marginPercent}% ({formatPaise(estimatedMarginPaise)})</span>
              </div>
              {marginWarning && (
                <p className="text-[11px] mt-1 text-amber-800">
                  ⚠️ Estimated margin is below the 20% target. Audited in financial records.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Totals Box */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Financial Summary</h3>

          <div className="flex justify-between text-xs py-1">
            <span className="text-slate-500">BOM Subtotal (excl. Tax):</span>
            <span className="font-semibold text-slate-800">{formatPaise(subtotalPaise)}</span>
          </div>

          {discountPaise > 0n && (
            <div className="flex justify-between text-xs py-1 text-emerald-700">
              <span>Applied Discount:</span>
              <span className="font-semibold">-{formatPaise(discountPaise)}</span>
            </div>
          )}

          <div className="flex justify-between text-xs py-1">
            <span className="text-slate-500">GST (18% Applicable):</span>
            <span className="font-semibold text-slate-800">{formatPaise(taxPaise)}</span>
          </div>

          <div className="flex justify-between text-base font-bold py-2 border-t border-slate-200 text-slate-900">
            <span>Customer Total:</span>
            <span className="text-blue-700">{formatPaise(totalPaise)}</span>
          </div>

          {subsidyPaise > 0n && (
            <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="flex justify-between font-bold">
                <span>Indicative PM Surya Ghar Subsidy:</span>
                <span>{formatPaise(subsidyPaise)}</span>
              </div>
              <p className="text-[10px] text-emerald-700">
                Direct Benefit Transfer to customer account post DISCOM net-meter inspection.
              </p>
            </div>
          )}

          <div className="pt-2 text-xs text-slate-400">
            Advance Required for Confirmation (30%): <strong>{formatPaise(BigInt(Math.round(Number(totalPaise) * 0.3)))}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
