'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Camera,
  Barcode,
  X,
  AlertTriangle,
  MapPin,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  PackagePlus,
  ShieldCheck,
  Send
} from 'lucide-react';
import Scanner, { ScanResult } from '@/components/Scanner';

interface ScannedUnit {
  dispatchUnitId: string;
  unitId: string;
  serialNumber: string;
  qrCode: string;
  scannedAt: string;
}

interface DispatchLine {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  isSerialized: boolean;
  qtyRequired: number;
  qtyLoaded: number;
  scannedUnits: ScannedUnit[];
}

interface DispatchData {
  id: string;
  dispatchNumber: string;
  status: string;
  orderNumber: string;
  customerName: string;
  customerCity: string;
  fromLocationName: string;
  scheduledOn: string;
  departedAt: string | null;
  deliveredAt: string | null;
  isFullyLoaded: boolean;
  lines: DispatchLine[];
}

export default function DispatchScanClient({
  initialDispatch,
}: {
  initialDispatch: DispatchData;
}) {
  const router = useRouter();
  const [dispatch, setDispatch] = useState<DispatchData>(initialDispatch);
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);
  const [manualCode, setManualCode] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  // Per-line manual load quantities for non-serialized (bulk) items (FR-5.5)
  const [loadQty, setLoadQty] = useState<Record<string, string>>({});
  // Idempotency key for the departure action: generated once and reused so a
  // retried/network-repeated departure never double-decrements stock.
  const [departIdempotencyKey] = useState<string>(() => uuidv4());

  const totalRequired = dispatch.lines.reduce((s, l) => s + l.qtyRequired, 0);
  const totalLoaded = dispatch.lines.reduce((s, l) => s + l.qtyLoaded, 0);
  const allComplete = totalLoaded >= totalRequired && totalRequired > 0;

  async function handleScanCode(code: string, method: 'QR' | 'BARCODE' | 'MANUAL') {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setScanMessage(null);

    try {
      const res = await fetch(`/api/v1/dispatch/${dispatch.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitCode: clean,
          method,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || `Unit scan rejected (${res.status})`);
      }

      setScanMessage({ text: `Unit ${clean} scanned successfully!`, type: 'success' });
      setManualCode('');

      // Update line state from the scan response (product ids map 1:1 to lines)
      setDispatch((prev) => {
        const updatedLines = prev.lines.map((l) =>
          l.productId === data.productId
            ? {
                ...l,
                qtyLoaded: data.qtyLoaded ?? l.qtyLoaded + 1,
                scannedUnits: [
                  ...l.scannedUnits,
                  {
                    dispatchUnitId: data.dispatchUnitId || crypto.randomUUID(),
                    unitId: data.unitId || crypto.randomUUID(),
                    serialNumber: data.serialNumber || clean,
                    qrCode: data.qrCode || clean,
                    scannedAt: new Date().toISOString(),
                  },
                ],
              }
            : l
        );
        return {
          ...prev,
          status: data.isDispatchReady ? 'READY' : prev.status,
          lines: updatedLines,
        };
      });
    } catch (err: any) {
      setScanMessage({ text: err.message || 'Scan failed', type: 'error' });
    }
  }

  async function handleUnscan(unitId: string) {
    if (!confirm('Remove this scanned unit from the truck?')) return;
    setScanMessage(null);

    try {
      const res = await fetch(`/api/v1/dispatch/${dispatch.id}/unscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || data.message || 'Failed to remove unit');
      }

      // Optimistically remove unit from line
      setDispatch((prev) => {
        const updatedLines = prev.lines.map((l) => ({
          ...l,
          scannedUnits: l.scannedUnits.filter((u) => u.unitId !== unitId),
          qtyLoaded: Math.max(0, l.qtyLoaded - 1),
        }));
        return { ...prev, lines: updatedLines };
      });
      setScanMessage({ text: 'Unit removed from dispatch.', type: 'success' });
    } catch (err: any) {
      setScanMessage({ text: err.message || 'Unscan failed', type: 'error' });
    }
  }

  /** Loads a bulk (non-serialized) quantity onto a dispatch line (FR-5.5). */
  async function handleLoadNonSerialized(lineId: string, productName: string) {
    const raw = loadQty[lineId];
    const qty = Number(raw);
    if (!raw || !Number.isFinite(qty) || qty <= 0) {
      setScanMessage({ text: `Enter a quantity greater than zero for ${productName}.`, type: 'error' });
      return;
    }

    setLoadingAction(true);
    setScanMessage(null);
    try {
      const res = await fetch(`/api/v1/dispatch/${dispatch.id}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, qty }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Load rejected');
      }

      setDispatch((prev) => ({
        ...prev,
        status: data.isDispatchReady ? 'READY' : prev.status,
        lines: prev.lines.map((l) =>
          l.id === lineId ? { ...l, qtyLoaded: data.qtyLoaded ?? l.qtyLoaded } : l
        ),
      }));
      setLoadQty((prev) => ({ ...prev, [lineId]: '' }));
      setScanMessage({
        text: `Loaded ${qty} × ${productName} (${data.qtyLoaded}/${data.qtyRequired}).`,
        type: 'success',
      });
    } catch (err: any) {
      setScanMessage({ text: err.message || 'Load failed', type: 'error' });
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleDepart() {
    if (!allComplete) {
      alert('Cannot depart: not all required equipment lines have been loaded.');
      return;
    }

    if (!confirm('Gate Check: Confirm truck departure from warehouse? This will mark units DISPATCHED.')) {
      return;
    }

    setLoadingAction(true);
    try {
      const res = await fetch(`/api/v1/dispatch/${dispatch.id}/depart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': departIdempotencyKey,
        },
        body: JSON.stringify({ idempotencyKey: departIdempotencyKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Departure confirmation failed');
      }

      setDispatch((prev) => ({
        ...prev,
        status: 'IN_TRANSIT',
        departedAt: new Date().toISOString(),
      }));
      setScanMessage({ text: 'Dispatch marked IN_TRANSIT. Driver has departed.', type: 'success' });
    } catch (err: any) {
      setScanMessage({ text: err.message || 'Departure failed', type: 'error' });
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleDeliver() {
    if (!confirm('Confirm goods delivered to customer site? This auto-activates all product warranties.')) {
      return;
    }

    setLoadingAction(true);
    try {
      const res = await fetch(`/api/v1/dispatch/${dispatch.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Delivery confirmation failed');
      }

      setDispatch((prev) => ({
        ...prev,
        status: 'DELIVERED',
        deliveredAt: new Date().toISOString(),
      }));
      setScanMessage({
        text: `Delivered! ${data.warrantiesCount || 0} product warranty records activated.`,
        type: 'success',
      });
    } catch (err: any) {
      setScanMessage({ text: err.message || 'Delivery failed', type: 'error' });
    } finally {
      setLoadingAction(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dispatch')}
            className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-orange-600">
                {dispatch.dispatchNumber}
              </span>
              <span className="text-xs px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700">
                {dispatch.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2">
              <Truck className="w-6 h-6 text-orange-600" />
              <span>Pick & Serial Scan (Screen S13)</span>
            </h1>
          </div>
        </div>

        {/* Departure Status / Action */}
        <div className="flex items-center gap-2">
          {dispatch.status === 'DELIVERED' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" /> Delivered to Site
            </span>
          ) : dispatch.status === 'IN_TRANSIT' ? (
            <button
              onClick={handleDeliver}
              disabled={loadingAction}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Site Delivery</span>
            </button>
          ) : (
            <button
              onClick={handleDepart}
              disabled={!allComplete || loadingAction}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md disabled:opacity-40 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>Confirm Warehouse Departure</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Message */}
      {scanMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-3 border ${
            scanMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {scanMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{scanMessage.text}</span>
        </div>
      )}

      {/* Dispatch Metadata Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Order Number</div>
          <div className="text-lg font-bold text-slate-900 font-mono mt-1">{dispatch.orderNumber}</div>
          <div className="text-xs text-slate-400 mt-1">{dispatch.customerName}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Destination</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{dispatch.customerCity || 'Site'}</div>
          <div className="text-xs text-slate-400 mt-1">From {dispatch.fromLocationName}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Dispatch Loading</div>
          <div className="text-lg font-bold text-blue-600 mt-1">
            {totalLoaded} / {totalRequired} Items
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {allComplete ? 'All items loaded' : `${totalRequired - totalLoaded} items remaining`}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Departure Gate Check</div>
          <div className="mt-1">
            {allComplete ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Truck
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" /> Incomplete Pick
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1">Enforces zero missing units</div>
        </div>
      </div>

      {/* Manual / Barcode Gun Input Bar */}
      {dispatch.status === 'PICKING' || dispatch.status === 'READY' ? (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Barcode className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Scan barcode with handheld gun or enter serial number..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScanCode(manualCode, 'BARCODE');
                  }
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              onClick={() => handleScanCode(manualCode, 'BARCODE')}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
            >
              Submit Barcode
            </button>
            <button
              onClick={() => setActiveLineIdx(0)}
              className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Camera Scanner</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Pick List Lines */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <span>Pick List Lines ({dispatch.lines.length})</span>
          </h2>
          <span className="text-xs text-slate-500">Screen S13 Hardware Verification</span>
        </div>

        <div className="divide-y divide-slate-100 p-4 space-y-6">
          {dispatch.lines.map((line, idx) => {
            const isLineFulfilled = line.qtyLoaded >= line.qtyRequired;
            const pct = line.qtyRequired > 0 ? Math.round((line.qtyLoaded / line.qtyRequired) * 100) : 0;

            return (
              <div key={line.id} className="pt-4 first:pt-0 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{line.productName}</h3>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      SKU: {line.productSku} · Required: {line.qtyRequired} units
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                        isLineFulfilled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {line.qtyLoaded} / {line.qtyRequired} Loaded
                    </span>

                    {!isLineFulfilled && (dispatch.status === 'PICKING' || dispatch.status === 'READY') && (
                      <button
                        onClick={() => setActiveLineIdx(idx)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Scan This Item</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isLineFulfilled ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {/* Scanned Serial Chips */}
                {line.scannedUnits.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-2">
                    {line.scannedUnits.map((u) => (
                      <span
                        key={u.dispatchUnitId}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 shadow-2xs"
                      >
                        <Barcode className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.serialNumber}</span>
                        {dispatch.status === 'PICKING' && (
                          <button
                            onClick={() => handleUnscan(u.unitId)}
                            className="text-slate-400 hover:text-rose-600 ml-1"
                            title="Unscan unit"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* Non-serialized bulk loading (FR-5.5: cable, structure, ACDB/DCDB) */}
                {!line.isSerialized &&
                  !isLineFulfilled &&
                  (dispatch.status === 'PICKING' || dispatch.status === 'READY') && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <PackagePlus className="w-4 h-4 text-orange-600" />
                        <span>Bulk item — load quantity</span>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={line.qtyRequired - line.qtyLoaded}
                        step="any"
                        placeholder={`0 - ${line.qtyRequired - line.qtyLoaded}`}
                        value={loadQty[line.id] ?? ''}
                        onChange={(e) =>
                          setLoadQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleLoadNonSerialized(line.id, line.productName);
                          }
                        }}
                        className="w-full sm:w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                      />
                      <button
                        onClick={() => handleLoadNonSerialized(line.id, line.productName)}
                        disabled={loadingAction}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50"
                      >
                        Load {line.qtyRequired - line.qtyLoaded > 0 ? `(${line.qtyRequired - line.qtyLoaded} remaining)` : ''}
                      </button>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Embedded Live Scanner Modal */}
      {activeLineIdx !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-4 border border-slate-800 text-white space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-orange-500" />
                  <span>Scan {dispatch.lines[activeLineIdx]?.productName}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Target unit barcode or QR label. Audio & haptic chime on detection.
                </p>
              </div>
              <button
                onClick={() => setActiveLineIdx(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-700">
              <Scanner
                onScan={(result: ScanResult) => {
                  handleScanCode(result.code, result.method === 'QR' ? 'QR' : 'BARCODE');
                }}
                active={activeLineIdx !== null}
              />
            </div>

            <div className="text-center text-xs text-slate-400">
              Line: {dispatch.lines[activeLineIdx]?.qtyLoaded || 0} /{' '}
              {dispatch.lines[activeLineIdx]?.qtyRequired || 1} units scanned
            </div>

            <button
              onClick={() => setActiveLineIdx(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold text-white"
            >
              Close Scanner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
