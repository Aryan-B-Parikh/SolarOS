'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Camera,
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Package,
  Wrench,
  Clock,
  ArrowRight
} from 'lucide-react';
import Scanner, { ScanResult } from '@/components/Scanner';

interface UnitInfo {
  id: string;
  serialNumber: string;
  qrCode: string;
  status: string;
  product: {
    sku: string;
    name: string;
    category: string;
    brand?: string;
    model?: string;
  };
  customer?: {
    id: string;
    name: string;
    phone: string;
    city: string;
  };
  warranty?: {
    startDate: string;
    endDate: string;
    isValid: boolean;
  };
}

export default function TechScanPage() {
  const router = useRouter();
  const [scanActive, setScanActive] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [unitResult, setUnitResult] = useState<UnitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup(code: string) {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setError(null);
    setLoading(true);

    try {
      // Query unit by QR code or serial number
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(clean)}&type=unit`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.units && data.units.length > 0) {
          setUnitResult(data.units[0]);
          setScanActive(false);
          return;
        }
      }

      // Fallback: direct navigation to public warranty verification
      router.push(`/w/${clean}`);
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  function handleScan(result: ScanResult) {
    handleLookup(result.code);
  }

  return (
    <div className="max-w-md mx-auto space-y-4 pb-20 pt-2 px-3">
      {/* Header */}
      <div className="text-center pb-2 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 flex items-center justify-center gap-2">
          <Camera className="w-5 h-5 text-orange-600" />
          <span>Field Hardware Scanner</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Scan any panel, inverter, or battery QR/serial code on site.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Scanner Viewport */}
      {scanActive ? (
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden border border-slate-300 shadow-sm bg-black">
            <Scanner onScan={handleScan} active={scanActive} />
          </div>

          <div className="text-center">
            <button
              onClick={() => setScanActive(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium underline"
            >
              Enter Serial Manually Instead
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <button
            onClick={() => {
              setUnitResult(null);
              setScanActive(true);
            }}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            <span>Turn Camera Back On</span>
          </button>
        </div>
      )}

      {/* Manual Search */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Manual Barcode / Serial Lookup
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="e.g. SN-INV-001..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLookup(manualCode);
                }
              }}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg font-mono uppercase focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={() => handleLookup(manualCode)}
            disabled={loading || !manualCode.trim()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
          >
            {loading ? '...' : 'Lookup'}
          </button>
        </div>
      </div>

      {/* Unit Details Card (if loaded) */}
      {unitResult && (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                {unitResult.product.category}
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1">{unitResult.product.name}</h2>
              <div className="text-xs text-slate-500 font-mono">Serial: {unitResult.serialNumber}</div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {unitResult.status}
            </span>
          </div>

          {unitResult.customer && (
            <div className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="text-slate-500 font-medium">Customer:</div>
              <div className="font-semibold text-slate-900">{unitResult.customer.name}</div>
              <div className="text-slate-500">{unitResult.customer.city} · {unitResult.customer.phone}</div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href={`/w/${unitResult.qrCode}`}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>View Full Warranty & Spec Certificate</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
