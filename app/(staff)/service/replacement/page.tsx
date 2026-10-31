'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Wrench, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Camera, 
  Barcode, 
  X,
  RefreshCw
} from 'lucide-react';
import Scanner, { ScanResult } from '@/components/Scanner';

export default function ReplacementScanPage() {
  const router = useRouter();
  const [ticketId, setTicketId] = useState('');
  const [removedUnitCode, setRemovedUnitCode] = useState('');
  const [replacementUnitCode, setReplacementUnitCode] = useState('');
  const [activeScanTarget, setActiveScanTarget] = useState<'removed' | 'replacement' | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function handleScan(res: ScanResult) {
    const clean = res.code.trim().toUpperCase();
    if (activeScanTarget === 'removed') {
      setRemovedUnitCode(clean);
    } else if (activeScanTarget === 'replacement') {
      setReplacementUnitCode(clean);
    }
    setActiveScanTarget(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/parts/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          removedUnitCode: removedUnitCode.trim().toUpperCase(),
          replacementUnitCode: replacementUnitCode.trim().toUpperCase(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Replacement failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div>
        <Link
          href="/service"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Service Desk</span>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="p-3 rounded-xl bg-orange-50 text-orange-600">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Equipment Replacement Scan (Screen S18)</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Scan removed unit to RMA, install replacement from stock, and transfer warranty chain (Rule C9, ADR D5).
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result ? (
          <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-4">
            <div className="flex items-center gap-2 font-bold text-base">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <span>Replacement & Warranty Transfer Completed!</span>
            </div>
            <div className="text-xs space-y-1.5 bg-white/70 p-3.5 rounded-xl border border-emerald-100 font-mono">
              <div>Removed Faulty Unit: <span className="font-bold text-slate-900">{result.removedUnit.serialNumber}</span> (Status: {result.removedUnit.status})</div>
              <div>Installed Replacement: <span className="font-bold text-slate-900">{result.replacementUnit.serialNumber}</span> (Status: {result.replacementUnit.status})</div>
              {result.transferredWarranty && (
                <div className="mt-2 pt-2 border-t border-emerald-200 font-sans">
                  <div className="font-semibold flex items-center gap-1.5 text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Warranty Chain Transferred: Retains original coverage until {result.transferredWarranty.endDate}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="pt-2 flex gap-3">
              <Link
                href={`/service/${ticketId}`}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-xs"
              >
                View Updated Ticket
              </Link>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setTicketId('');
                  setRemovedUnitCode('');
                  setReplacementUnitCode('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50"
              >
                Process Another Swap
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Service Ticket ID or Number *
              </label>
              <input
                type="text"
                required
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="e.g. T-2026-0001 or ticket UUID"
                className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            {/* Removed Faulty Unit */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                1. Removed Faulty Unit (Serial or QR) *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={removedUnitCode}
                  onChange={(e) => setRemovedUnitCode(e.target.value)}
                  placeholder="Scan or type faulty unit serial..."
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setActiveScanTarget('removed')}
                  className="px-3.5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan</span>
                </button>
              </div>
            </div>

            {/* Replacement Warehouse Unit */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                2. Replacement Stock Unit (Must be IN_STOCK) *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={replacementUnitCode}
                  onChange={(e) => setReplacementUnitCode(e.target.value)}
                  placeholder="Scan or type new replacement serial..."
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setActiveScanTarget('replacement')}
                  className="px-3.5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan</span>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !ticketId || !removedUnitCode || !replacementUnitCode}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span>Executing Atomic Swap & Warranty Transfer...</span>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Confirm Swap & Transfer Warranty</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Live Camera Scanner Modal */}
      {activeScanTarget !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-4 border border-slate-800 text-white space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-orange-500" />
                  <span>
                    Scan {activeScanTarget === 'removed' ? 'Removed Faulty Unit' : 'New Replacement Unit'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Aim camera at unit barcode or QR label. Audio & haptic chime on detection.
                </p>
              </div>
              <button
                onClick={() => setActiveScanTarget(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-700">
              <Scanner
                onScan={handleScan}
                active={activeScanTarget !== null}
              />
            </div>

            <button
              onClick={() => setActiveScanTarget(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold text-white"
            >
              Cancel Scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
