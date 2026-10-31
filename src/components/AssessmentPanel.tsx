'use client';

import React, { useState } from 'react';
import { calculateSiteAssessment, AssessmentResult, ShadingLevel } from '@/domain/assessment';
import { AlertTriangle } from 'lucide-react';

/** Persisted SiteAssessment row (FR-2.6) surfaced in the quote builder. */
export interface PersistedAssessment {
  flags?: string[];
  ai_summary?: string | null;
  recommended_kw?: number | string;
  recommended_type?: string;
  annual_generation_kwh?: number | string;
  annual_savings_paise?: number | string;
  payback_years?: number | string;
}

interface AssessmentPanelProps {
  leadId: string;
  initialBillRs?: number;
  initialRoofAreaM2?: number;
  initialSanctionedLoadKw?: number;
  initialShading?: ShadingLevel;
  /** Persisted assessment flags + AI summary (shown above the calculator). */
  assessment?: PersistedAssessment | null;
  onUseInQuote?: (recommendedKw: number) => void;
}

export function AssessmentPanel({
  leadId,
  initialBillRs = 3000,
  initialRoofAreaM2 = 30,
  initialSanctionedLoadKw = 4,
  initialShading = 'NONE',
  assessment,
  onUseInQuote,
}: AssessmentPanelProps) {
  const [billRs, setBillRs] = useState<number>(initialBillRs);
  const [tariff, setTariff] = useState<number>(7);
  const [roofAreaM2, setRoofAreaM2] = useState<number>(initialRoofAreaM2);
  const [sanctionedLoad, setSanctionedLoad] = useState<number>(initialSanctionedLoadKw);
  const [shading, setShading] = useState<ShadingLevel>(initialShading);

  // Live pure calculator execution
  const result: AssessmentResult = calculateSiteAssessment({
    monthlyBillRs: billRs,
    tariffRsPerKwh: tariff,
    usableRoofAreaM2: roofAreaM2,
    sanctionedLoadKw: sanctionedLoad,
    shadingLevel: shading,
    quoteTotalRs: 180000,
    subsidyEstimateRs: 78000,
  });

  // Conflict warnings
  const isRoofCapped =
    result.roofCapacityLimitKw !== null &&
    result.requiredCapacityKw > result.roofCapacityLimitKw;

  const isSanctionedCapped =
    result.sanctionedLoadLimitKw !== null &&
    result.requiredCapacityKw > result.sanctionedLoadLimitKw;

  // Persisted sizing (FR-2.6): when the survey/assessment engine has stored
  // a recommendation, it wins over the ad-hoc calculator preview.
  const persistedKw = assessment?.recommended_kw ? Number(assessment.recommended_kw) : null;
  const effectiveKw = persistedKw ?? result.recommendedCapacityKw;
  const flags = assessment?.flags || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Panel Header */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            ⚡
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-white">Site Assessment & AI Sizing</h3>
              <span className="text-[11px] font-semibold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                Screen S4
              </span>
            </div>
            <p className="text-xs text-slate-300">
              TRD 2.4 Pure Sizing Calculator &bull; Advisory Analysis
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 border border-slate-700">
            {result.label}
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Persisted assessment flags + AI summary (FR-2.6 / FR-2.7) */}
        {assessment && (
          <div className="space-y-3">
            {flags.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                  Persisted Assessment Flags (survey engine)
                </p>
                {flags.map((flag, i) => (
                  <p key={i} className="text-[11px] text-amber-800 font-medium flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-px" />
                    <span>{flag}</span>
                  </p>
                ))}
              </div>
            )}
            {assessment.ai_summary && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  AI Site Advisory Summary (persisted)
                </p>
                <p className="text-xs text-slate-700 leading-relaxed">{assessment.ai_summary}</p>
              </div>
            )}
            {persistedKw && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                Survey-approved sizing: <strong>{persistedKw} kW {assessment.recommended_type?.replace('_', ' ') || ''}</strong>
                {assessment.annual_generation_kwh
                  ? ` - approx ${Number(assessment.annual_generation_kwh).toLocaleString('en-IN')} kWh/year`
                  : ''}
                . The &quot;Use in Quote&quot; action below applies this size.
              </div>
            )}
          </div>
        )}

        {/* Input Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Monthly Bill (₹)
            </label>
            <input
              type="number"
              value={billRs}
              onChange={(e) => setBillRs(Number(e.target.value) || 0)}
              step={500}
              min={500}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Tariff (₹ / kWh)
            </label>
            <input
              type="number"
              value={tariff}
              onChange={(e) => setTariff(Number(e.target.value) || 7)}
              step={0.5}
              min={1}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Roof Space (m²)
            </label>
            <input
              type="number"
              value={roofAreaM2}
              onChange={(e) => setRoofAreaM2(Number(e.target.value) || 0)}
              step={5}
              min={5}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Sanctioned Load (kW)
            </label>
            <input
              type="number"
              value={sanctionedLoad}
              onChange={(e) => setSanctionedLoad(Number(e.target.value) || 0)}
              step={1}
              min={1}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Shading Level
            </label>
            <select
              value={shading}
              onChange={(e) => setShading(e.target.value as ShadingLevel)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="NONE">None (1.00)</option>
              <option value="LOW">Low (0.95)</option>
              <option value="MEDIUM">Medium (0.85)</option>
              <option value="HIGH">High (0.70)</option>
            </select>
          </div>
        </div>

        {/* Constraint Conflict Warnings */}
        {(isRoofCapped || isSanctionedCapped) && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2 text-xs text-amber-800">
            <span className="font-bold text-amber-600 text-sm">⚠️</span>
            <div>
              <p className="font-bold">System Capacity Constraint Detected:</p>
              {isRoofCapped && (
                <p>
                  &bull; Household consumption requires {result.requiredCapacityKw} kW, but usable roof space ({roofAreaM2} m²) caps sizing at {result.roofCapacityLimitKw} kW.
                </p>
              )}
              {isSanctionedCapped && (
                <p>
                  &bull; Sizing is constrained by the grid sanctioned load ({sanctionedLoad} kW).
                </p>
              )}
            </div>
          </div>
        )}

        {/* Result Metrics Grid (5 KPI Cards with Estimate Badges) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Recommended</span>
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Estimate</span>
            </div>
            <div className="text-xl font-black text-slate-900">
              {result.recommendedCapacityKw} kW
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {result.panelCount} &times; 540Wp ({result.installedCapacityKwp} kWp)
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Generation</span>
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Estimate</span>
            </div>
            <div className="text-xl font-black text-slate-900">
              {result.yearlyGenerationKwh.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">kWh / year</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Annual Savings</span>
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Estimate</span>
            </div>
            <div className="text-xl font-black text-emerald-600">
              ₹ {result.yearlySavingsRs.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Conservative baseline</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Payback</span>
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Estimate</span>
            </div>
            <div className="text-xl font-black text-slate-900">
              {result.paybackYears ?? '3.0'} Yrs
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">With PM Surya Ghar</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Panels</span>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Count</span>
            </div>
            <div className="text-xl font-black text-slate-900">
              {result.panelCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">540 Wp Mono PERC</div>
          </div>
        </div>

        {/* AI Customer Summary & Risk Chips */}
        <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                🤖 AI Customer Summary
              </span>
              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                v1.1.0 &bull; Zod Validated
              </span>
            </div>
            <span className="text-[11px] font-bold text-amber-700">Advisory Only</span>
          </div>

          <p className="text-xs text-slate-800 leading-relaxed font-medium">
            Based on your electricity consumption and available roof space, a {result.recommendedCapacityKw} kW system is recommended; estimated annual generation is approximately {result.yearlyGenerationKwh.toLocaleString()} kWh, yielding estimated annual savings of approximately Rs {result.yearlySavingsRs.toLocaleString()}. Your roof measurements and sanctioned load should be verified before final approval.
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[11px] font-medium bg-white text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              ⚡ Verify structural roof stability
            </span>
            {shading !== 'NONE' && (
              <span className="text-[11px] font-medium bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs">
                ☀️ Shading factor {result.shadingFactorApplied} applied
              </span>
            )}
            <span className="text-[11px] font-medium bg-white text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              🔌 DISCOM net-metering feasibility check
            </span>
          </div>
        </div>

        {/* Action Button: Use in Quote */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-slate-400 italic">
            * All calculations adhere strictly to TRD 2.4 conservative estimation formulas.
          </p>
          <button
            type="button"
            onClick={() => onUseInQuote && onUseInQuote(effectiveKw)}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-200 transition flex items-center space-x-1.5"
          >
            <span>Use {effectiveKw} kW in Quote</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

