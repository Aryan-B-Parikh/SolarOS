'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface QuoteLine {
  id: string;
  description: string;
  qty: number;
  rule: string;
  unitPriceFormatted: string;
  taxRatePercent: number;
  lineTotalFormatted: string;
}

interface QuoteData {
  quoteNumber: string;
  version: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  capacityKw: number;
  systemType: string;
  cableDistanceM: number;
  subtotalFormatted: string;
  discountFormatted: string;
  taxFormatted: string;
  totalFormatted: string;
  subsidyEstimateFormatted: string;
  validUntilFormatted: string;
  validUntil: string;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  isExpired: boolean;
  customer: {
    name: string;
    maskedPhone: string;
    address: string;
    pincode: string;
  };
  lines: QuoteLine[];
  savings: {
    annualSavingsRupees: number;
    annualGenerationKwh: number;
    paybackYears: number;
  };
  company: {
    name: string;
    address: string;
    gstin: string;
    phone: string;
    email: string;
  };
  pdfUrl: string;
}

interface Props {
  quote: QuoteData;
  token: string;
}

export default function QuoteClientView({ quote, token }: Props) {
  const [currentStatus, setCurrentStatus] = useState(quote.status);
  const [acceptedByName, setAcceptedByName] = useState(quote.customer.name);
  const [phoneLastFour, setPhoneLastFour] = useState('');
  const [rejectReason, setRejectReason] = useState('Found cheaper alternative');
  const [customRejectReason, setCustomRejectReason] = useState('');
  const [actionTab, setActionTab] = useState<'ACCEPT' | 'REJECT'>('ACCEPT');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const isPending = currentStatus === 'SENT' && !quote.isExpired;

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneLastFour || phoneLastFour.length !== 4) {
      setErrorMsg('Please enter the exact last 4 digits of your registered phone number.');
      return;
    }
    if (!acceptedByName.trim()) {
      setErrorMsg('Please provide your full legal name for confirmation signature.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/public/quotes/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedName: acceptedByName.trim(),
          phoneLastFour: phoneLastFour.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Verification failed. Please check phone digits.');
      }

      setCurrentStatus('ACCEPTED');
      setOrderNumber(data.orderNumber || 'CONFIRMED');
      setSuccessMsg('Thank you! Your quotation has been officially accepted.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to accept quotation.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneLastFour || phoneLastFour.length !== 4) {
      setErrorMsg('Please enter the exact last 4 digits of your registered phone number.');
      return;
    }

    const finalReason = rejectReason === 'Other' ? customRejectReason : rejectReason;
    if (!finalReason || finalReason.trim().length < 3) {
      setErrorMsg('Please provide a specific reason for declining.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/public/quotes/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejectReason: finalReason.trim(),
          phoneLastFour: phoneLastFour.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Verification failed. Please check phone digits.');
      }

      setCurrentStatus('REJECTED');
      setSuccessMsg('Your feedback has been recorded. Our team will review and contact you.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit decline request.');
    } finally {
      setLoading(false);
    }
  };

  const getRuleBadgeColor = (rule: string) => {
    switch (rule) {
      case 'PANEL_COUNT':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'PER_PANEL':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'PER_KW':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'PER_CABLE_METER':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Notice Banners */}
      {currentStatus === 'ACCEPTED' && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 text-emerald-900 shadow-sm animate-in fade-in">
          <div className="flex items-start space-x-3.5">
            <span className="text-3xl">✅</span>
            <div className="flex-1">
              <h2 className="text-lg font-bold">Quotation Accepted & Order Created!</h2>
              <p className="text-sm text-emerald-800 mt-1">
                Accepted by <strong>{acceptedByName || quote.acceptedName}</strong>. 
                {orderNumber && ` Order Reference: #${orderNumber}.`}
              </p>
              <p className="text-xs text-emerald-700 mt-2">
                Our operations team has received your confirmation. Equipment reservation and warehouse dispatch preparation are underway.
              </p>
              <div className="mt-4">
                <Link
                  href={`/portal/${token}`}
                  className="inline-flex items-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition shadow-sm"
                >
                  Track on Customer Portal →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentStatus === 'REJECTED' && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 text-amber-900 shadow-sm">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">📋</span>
            <div>
              <h2 className="text-base font-bold">Quotation Declined</h2>
              <p className="text-xs text-amber-800 mt-1">
                Reason recorded: <em>&ldquo;{quote.rejectReason || rejectReason}&rdquo;</em>.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Our sales consultants have been notified and will be happy to offer revised system sizing, alternative inverters, or updated payment structures.
              </p>
            </div>
          </div>
        </div>
      )}

      {quote.isExpired && currentStatus === 'SENT' && (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-5 text-red-900 shadow-sm">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">⏳</span>
            <div>
              <h2 className="text-base font-bold">Quotation Validity Expired</h2>
              <p className="text-xs text-red-800 mt-1">
                This quote was valid until {quote.validUntilFormatted}. Due to changes in component raw material pricing or subsidy schemes, please request an updated proposal.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Hero Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold tracking-wider uppercase text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {quote.systemType.replace('_', ' ')}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Version {quote.version}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1.5">
              {quote.capacityKw} kW Solar Power System
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Prepared for <strong className="text-slate-800">{quote.customer.name}</strong> • {quote.customer.address}, {quote.customer.pincode}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="text-right sm:border-r sm:pr-4 border-slate-200">
              <div className="text-[11px] text-slate-400 font-medium">Quote Reference</div>
              <div className="text-base font-bold text-slate-800 tracking-tight font-mono">
                {quote.quoteNumber}
              </div>
              <div className="text-[11px] text-slate-500">
                Valid until {quote.validUntilFormatted}
              </div>
            </div>

            <a
              href={quote.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow-sm"
            >
              <span>📄</span>
              <span>Download PDF</span>
            </a>
          </div>
        </div>

        {/* 3 Key Benefit Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-4 text-center">
            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Est. Annual Output
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-900 mt-1">
              {quote.savings.annualGenerationKwh.toLocaleString('en-IN')} <span className="text-xs font-semibold text-amber-700">kWh/yr</span>
            </div>
            <div className="text-[11px] text-amber-700/80 mt-0.5">
              Clean rooftop solar power
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-xl p-4 text-center">
            <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Annual Bill Savings
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-900 mt-1">
              ₹{quote.savings.annualSavingsRupees.toLocaleString('en-IN')} <span className="text-xs font-semibold text-emerald-700">/yr</span>
            </div>
            <div className="text-[11px] text-emerald-700/80 mt-0.5">
              At average grid tariff
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 rounded-xl p-4 text-center">
            <div className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
              Estimated Payback
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-900 mt-1">
              {quote.savings.paybackYears} <span className="text-xs font-semibold text-blue-700">Years</span>
            </div>
            <div className="text-[11px] text-blue-700/80 mt-0.5">
              Net of PM Surya Ghar subsidy
            </div>
          </div>
        </div>
      </div>

      {/* Bill of Materials Itemized Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Itemized Bill of Materials (BOM)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              12 system components calculated automatically for your {quote.capacityKw} kW installation and {quote.cableDistanceM} m cable run.
            </p>
          </div>
          <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
            {quote.lines.length} Line Items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Component & Specification</th>
                <th className="py-3 px-4 text-center">Quantity</th>
                <th className="py-3 px-4 text-center">BOM Rule</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right">GST</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {quote.lines.map((line, idx) => (
                <tr key={line.id || idx} className="hover:bg-slate-50/60 transition">
                  <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {line.description}
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-slate-800">
                    {line.qty}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRuleBadgeColor(
                        line.rule
                      )}`}
                    >
                      {line.rule}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600 font-mono">
                    {line.unitPriceFormatted}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500">
                    {line.taxRatePercent}%
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">
                    {line.lineTotalFormatted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary & Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment & Subsidy Details */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
              Incentive & Bank Information
            </h3>
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-sm text-emerald-800">
                <span>🏛️</span>
                <span>PM Surya Ghar: Muft Bijli Yojana</span>
              </div>
              <p className="leading-relaxed">
                Eligible for direct Central Government DBT subsidy of up to <strong>{quote.subsidyEstimateFormatted}</strong> directly credited to your DISCOM-linked Aadhaar bank account upon commissioning.
              </p>
            </div>

            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 text-slate-600">
              <div className="font-semibold text-slate-800">Payment Milestones:</div>
              <div className="flex justify-between">
                <span>Booking Advance (30%):</span>
                <span className="font-bold text-slate-800">On Order Confirmation</span>
              </div>
              <div className="flex justify-between">
                <span>Material Dispatch (50%):</span>
                <span className="font-bold text-slate-800">Before Warehouse Release</span>
              </div>
              <div className="flex justify-between">
                <span>Installation Handover (20%):</span>
                <span className="font-bold text-slate-800">Net Metering Sign-off</span>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-400">
            All prices in Indian Rupees (INR) inclusive of GST. Bank transfer details available on the official PDF.
          </div>
        </div>

        {/* Totals Calculation Box */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              Financial Summary
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (12 BOM Lines):</span>
                <span className="font-mono font-medium text-slate-800">{quote.subtotalFormatted}</span>
              </div>
              {quote.discountFormatted !== '₹0.00' && (
                <div className="flex justify-between text-emerald-700">
                  <span>Special Promotional Discount:</span>
                  <span className="font-mono font-bold">-{quote.discountFormatted}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>GST Tax (12% & 18%):</span>
                <span className="font-mono font-medium text-slate-800">{quote.taxFormatted}</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between text-base font-extrabold text-slate-900">
                <span>Total Quotation Value:</span>
                <span className="font-mono text-lg text-slate-900">{quote.totalFormatted}</span>
              </div>

              {quote.subsidyEstimateFormatted !== '₹0.00' && (
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-emerald-900 block">Less PM Surya Ghar Subsidy:</span>
                    <span className="text-[10px] text-emerald-700">Credited to your bank account</span>
                  </div>
                  <span className="font-mono font-black text-emerald-700 text-sm">-{quote.subsidyEstimateFormatted}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Guaranteed Equipment:</span>
            <span className="font-semibold text-slate-700">Tier-1 Mono PERC & IP65 Inverter</span>
          </div>
        </div>
      </div>

      {/* Customer Action Section (Acceptance / Decline) */}
      {isPending && (
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-md p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Authorize Your Quotation
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Strict 2-factor verification required under Rule D11. Enter the last 4 digits of your registered phone.
              </p>
            </div>

            {/* Toggle Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setActionTab('ACCEPT');
                  setErrorMsg(null);
                }}
                className={`py-1.5 px-3.5 rounded-lg transition ${
                  actionTab === 'ACCEPT'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Accept Quote
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionTab('REJECT');
                  setErrorMsg(null);
                }}
                className={`py-1.5 px-3.5 rounded-lg transition ${
                  actionTab === 'REJECT'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Decline Quote
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-5 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xl p-3.5 flex items-center space-x-2">
              <span className="text-base">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {actionTab === 'ACCEPT' ? (
            <form onSubmit={handleAccept} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Customer Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={acceptedByName}
                    onChange={(e) => setAcceptedByName(e.target.value)}
                    placeholder="e.g. Ramesh Patel"
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Acts as your official digital sign-off.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Verification (Last 4 Digits)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    pattern="\d{4}"
                    value={phoneLastFour}
                    onChange={(e) => setPhoneLastFour(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 0021"
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-slate-900 text-center tracking-widest text-base font-bold"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Registered mobile: <strong>{quote.customer.maskedPhone}</strong>
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  By accepting, an official order is generated and locked for dispatch preparation.
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {loading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <span>✓ Accept Quotation ({quote.totalFormatted})</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleReject} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Reason for Declining
                  </label>
                  <select
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-500 text-slate-900 bg-white"
                  >
                    <option value="Found cheaper alternative">Found cheaper alternative</option>
                    <option value="Budget constraints">Budget constraints</option>
                    <option value="Postponing installation">Postponing installation</option>
                    <option value="System capacity too high/low">System capacity too high/low</option>
                    <option value="Roof structural concerns">Roof structural concerns</option>
                    <option value="Other">Other reason (specify below)</option>
                  </select>

                  {rejectReason === 'Other' && (
                    <input
                      type="text"
                      required
                      placeholder="Please specify reason..."
                      value={customRejectReason}
                      onChange={(e) => setCustomRejectReason(e.target.value)}
                      className="mt-2 w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Verification (Last 4 Digits)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    pattern="\d{4}"
                    value={phoneLastFour}
                    onChange={(e) => setPhoneLastFour(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 0021"
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-500 font-mono text-slate-900 text-center tracking-widest text-base font-bold"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Registered mobile: <strong>{quote.customer.maskedPhone}</strong>
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  Sales will receive your feedback and keep your consultation file open for revisions.
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {loading ? <span>Verifying...</span> : <span>✕ Submit Decline Notice</span>}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

