'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sun, ShieldCheck, QrCode, Phone, ArrowRight, CheckCircle2, Wrench, FileText } from 'lucide-react';

export default function CustomerPortalLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your mobile number or equipment serial.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/public/portal-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to locate customer record');
      }

      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to find an installation with this detail.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (val: string) => {
    setIdentifier(val);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-xs">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-slate-900 block leading-tight">SunPower Ops</span>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Customer Portal</span>
          </div>
        </Link>
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
        >
          Staff Sign-in →
        </Link>
      </header>

      {/* Main Container */}
      <main className="max-w-xl w-full mx-auto p-6 sm:p-8 my-auto">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mb-1">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Customer Portal & Warranty Tracker
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Track your installed solar system, active 20-year equipment warranties, serial numbers, generation savings, and service requests.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Registered Phone Number or Inverter Serial / QR
              </label>
              <div className="relative">
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. +91 90000 00021 or SPU-7F3K9Q"
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                <span>💡</span>
                <span>Enter the 10-digit mobile number given during rooftop survey, or scan your inverter&apos;s QR code.</span>
              </p>
            </div>

            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-slate-950 font-bold py-3.5 px-6 rounded-2xl shadow-sm hover:shadow transition flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Looking up your installation...</span>
                </>
              ) : (
                <>
                  <span>Access My Solar Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Pre-sets */}
          <div className="pt-4 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Try Demo Solar Installations:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickDemo('+919000000021')}
                className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition group"
              >
                <div className="font-bold text-slate-800 group-hover:text-emerald-800">
                  Pravinbhai Patel
                </div>
                <div className="text-[10px] text-slate-400">
                  Installed May 2025 • In Warranty
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('SPU-7F3K9Q')}
                className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 transition group"
              >
                <div className="font-bold text-slate-800 group-hover:text-amber-800 flex items-center justify-between">
                  <span>Inverter QR Code</span>
                  <QrCode className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  SPU-7F3K9Q • 3 kW On-Grid
                </div>
              </button>
            </div>
          </div>

          {/* Features Highlights */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-center">
            <div className="space-y-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
              <span className="text-[11px] font-bold text-slate-700 block">20-Yr Warranty</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Panel performance</span>
            </div>
            <div className="space-y-1">
              <FileText className="w-4 h-4 text-blue-600 mx-auto" />
              <span className="text-[11px] font-bold text-slate-700 block">Certificates</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Signed documents</span>
            </div>
            <div className="space-y-1">
              <Wrench className="w-4 h-4 text-amber-600 mx-auto" />
              <span className="text-[11px] font-bold text-slate-700 block">Free Service</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Zero-cost under warranty</span>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-6 text-xs text-slate-400 space-y-1">
          <p>Don&apos;t have solar yet? <Link href="/enquiry" className="text-amber-600 font-bold hover:underline">Apply for PM Surya Ghar rooftop installation →</Link></p>
          <p className="text-[11px]">SunPower Ops &bull; Passwordless Secure Token Protocol &bull; DPDP Act 2023 Compliant</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-[11px] text-slate-400 border-t border-slate-200 bg-white">
        SunPower Solar Energy Pvt Ltd &bull; 402 Solar Tower, S.G. Highway, Ahmedabad &bull; Support: +91 79 4000 1234
      </footer>
    </div>
  );
}

