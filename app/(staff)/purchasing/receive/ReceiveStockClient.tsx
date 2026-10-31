'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  PackageCheck,
  Building2,
  FileText,
  MapPin,
  Plus,
  Trash2,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Barcode,
  Layers,
  X
} from 'lucide-react';
import Scanner, { ScanResult } from '@/components/Scanner';
import { generateLabels, QRLabel } from '@/lib/qr';

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  category: string;
  is_serialized: boolean;
  uom: string;
  warranty_months: number;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

interface POOption {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  lines: {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    qtyOrdered: number;
    qtyReceived: number;
    unitCostPaise: number;
    isSerialized: boolean;
  }[];
}

interface LineForm {
  poLineId?: string;
  productId: string;
  qty: number;
  unitCostRupees: number;
  serialNumbers: string[];
  isSerialized: boolean;
}

export default function ReceiveStockClient({
  products,
  locations,
  purchaseOrders,
  prefilledPoId,
}: {
  products: ProductOption[];
  locations: LocationOption[];
  purchaseOrders: POOption[];
  prefilledPoId?: string;
}) {
  const router = useRouter();
  const [selectedPoId, setSelectedPoId] = useState<string>(prefilledPoId || '');
  const [locationId, setLocationId] = useState<string>(locations[0]?.id || '');
  const [invoiceRef, setInvoiceRef] = useState<string>('');
  const [lines, setLines] = useState<LineForm[]>([]);
  const [activeScannerLineIdx, setActiveScannerLineIdx] = useState<number | null>(null);
  const [manualSerialInput, setManualSerialInput] = useState<string>('');
  const [bulkPasteLineIdx, setBulkPasteLineIdx] = useState<number | null>(null);
  const [bulkPasteText, setBulkPasteText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    receiptNumber: string;
    unitsCount: number;
    labels: QRLabel[];
  } | null>(null);

  // Initialize lines when PO is selected
  React.useEffect(() => {
    if (selectedPoId) {
      const po = purchaseOrders.find((p) => p.id === selectedPoId);
      if (po && po.lines.length > 0) {
        const remainingLines = po.lines
          .filter((l) => l.qtyOrdered > l.qtyReceived)
          .map((l) => ({
            poLineId: l.id,
            productId: l.productId,
            qty: l.qtyOrdered - l.qtyReceived,
            unitCostRupees: Math.round(l.unitCostPaise / 100),
            serialNumbers: [],
            isSerialized: l.isSerialized,
          }));

        if (remainingLines.length > 0) {
          setLines(remainingLines);
          return;
        }
      }
    }
    // Default to 1 empty line if no PO selected or PO has no remaining lines
    if (lines.length === 0) {
      const defaultProd = products[0];
      setLines([
        {
          productId: defaultProd?.id || '',
          qty: 1,
          unitCostRupees: 0,
          serialNumbers: [],
          isSerialized: defaultProd?.is_serialized || false,
        },
      ]);
    }
  }, [selectedPoId]);

  function handleProductChange(idx: number, productId: string) {
    const prod = products.find((p) => p.id === productId);
    const updated = [...lines];
    updated[idx] = {
      ...updated[idx],
      productId,
      isSerialized: prod?.is_serialized || false,
      serialNumbers: [],
    };
    setLines(updated);
  }

  function handleQtyChange(idx: number, qty: number) {
    const safeQty = Math.max(1, qty);
    const updated = [...lines];
    updated[idx] = { ...updated[idx], qty: safeQty };
    setLines(updated);
  }

  function handleCostChange(idx: number, cost: number) {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], unitCostRupees: Math.max(0, cost) };
    setLines(updated);
  }

  function addEmptyLine() {
    const defaultProd = products[0];
    setLines([
      ...lines,
      {
        productId: defaultProd?.id || '',
        qty: 1,
        unitCostRupees: 0,
        serialNumbers: [],
        isSerialized: defaultProd?.is_serialized || false,
      },
    ]);
  }

  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
    if (activeScannerLineIdx === idx) setActiveScannerLineIdx(null);
  }

  function handleScan(result: ScanResult) {
    if (activeScannerLineIdx === null) return;
    const cleanCode = result.code.trim().toUpperCase();
    const line = lines[activeScannerLineIdx];

    if (line.serialNumbers.includes(cleanCode)) {
      return; // Ignore duplicate scan
    }

    if (line.serialNumbers.length >= line.qty) {
      // Reached qty limit
      setActiveScannerLineIdx(null);
      return;
    }

    const updated = [...lines];
    updated[activeScannerLineIdx] = {
      ...line,
      serialNumbers: [...line.serialNumbers, cleanCode],
    };
    setLines(updated);

    if (updated[activeScannerLineIdx].serialNumbers.length >= line.qty) {
      setActiveScannerLineIdx(null);
    }
  }

  function addManualSerial(idx: number) {
    const code = manualSerialInput.trim().toUpperCase();
    if (!code) return;
    const line = lines[idx];
    if (line.serialNumbers.includes(code)) {
      setErrorMessage(`Serial "${code}" already added in this line.`);
      return;
    }
    const updated = [...lines];
    updated[idx] = {
      ...line,
      serialNumbers: [...line.serialNumbers, code],
    };
    setLines(updated);
    setManualSerialInput('');
    setErrorMessage(null);
  }

  function removeSerial(lineIdx: number, serial: string) {
    const line = lines[lineIdx];
    const updated = [...lines];
    updated[lineIdx] = {
      ...line,
      serialNumbers: line.serialNumbers.filter((s) => s !== serial),
    };
    setLines(updated);
  }

  function handleApplyBulkPaste(lineIdx: number) {
    const parsed = bulkPasteText
      .split(/[\r\n,;\t]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    const line = lines[lineIdx];
    const existing = new Set(line.serialNumbers);
    for (const s of parsed) {
      if (existing.size < line.qty) {
        existing.add(s);
      }
    }

    const updated = [...lines];
    updated[lineIdx] = {
      ...line,
      serialNumbers: Array.from(existing),
    };
    setLines(updated);
    setBulkPasteLineIdx(null);
    setBulkPasteText('');
  }

  async function handleSubmitReceipt(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!locationId) {
      setErrorMessage('Please select a destination warehouse location.');
      return;
    }

    if (lines.length === 0) {
      setErrorMessage('Please add at least one line item to receive.');
      return;
    }

    // Validate serialized items have exact serial numbers
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const prod = products.find((p) => p.id === l.productId);
      const name = prod?.name || `Line #${i + 1}`;
      if (l.isSerialized) {
        if (l.serialNumbers.length !== l.qty) {
          setErrorMessage(
            `"${name}" is serialized and requires exactly ${l.qty} serial number(s). Currently has ${l.serialNumbers.length}.`
          );
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        poId: selectedPoId || undefined,
        locationId,
        supplierInvoiceRef: invoiceRef.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitCostPaise: l.unitCostRupees * 100,
          poLineId: l.poLineId,
          serialNumbers: l.isSerialized ? l.serialNumbers : undefined,
        })),
      };

      const res = await fetch('/api/v1/purchasing/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Stock receipt failed');
      }

      // Build REAL scannable QR labels (FR-5.2) for every serialized unit
      const createdUnits: Array<{
        id: string;
        productId: string;
        productName: string;
        serialNumber: string;
        qrCode: string;
      }> = data.units || [];
      const labels = await generateLabels(
        createdUnits.map((u) => {
          const product = products.find((p) => p.id === u.productId);
          return {
            serialNumber: u.serialNumber,
            qrCode: u.qrCode,
            productName: u.productName || product?.name || '',
            sku: product?.sku || '',
            warrantyMonths: product?.warranty_months ?? 0,
          };
        })
      ).catch(() => []);

      setSuccessReceipt({
        receiptNumber: data.receiptNumber || 'RCV-SUCCESS',
        unitsCount: createdUnits.length,
        labels,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit stock receipt');
    } finally {
      setSubmitting(false);
    }
  }

  if (successReceipt) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-4 space-y-8">
        {/* Print CSS: hide everything except the QR label sheet (FR-5.2) */}
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #qr-label-sheet, #qr-label-sheet * { visibility: visible; }
            #qr-label-sheet {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 10mm;
              box-sizing: border-box;
            }
            #qr-label-sheet .label-card { page-break-inside: avoid; }
          }
        `}</style>

        <div className="max-w-2xl mx-auto text-center space-y-4">
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Stock Received Successfully!</h1>
            <p className="text-slate-600">
              Receipt <span className="font-mono font-bold text-slate-900">{successReceipt.receiptNumber}</span> has been processed.
              Stock quantities and moving average costs have been updated in the ledger.
            </p>
            {successReceipt.unitsCount > 0 && (
              <div className="p-3 bg-blue-50 text-blue-800 rounded-xl text-sm font-medium">
                {successReceipt.unitsCount} serialized unit(s) generated with unique QR codes.
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3 pt-4">
              {successReceipt.labels.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 shadow-sm"
                >
                  <Barcode className="w-4 h-4" />
                  <span>Print Labels ({successReceipt.labels.length})</span>
                </button>
              )}
              <button
                onClick={() => router.push('/inventory')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800"
              >
                View Inventory
              </button>
              <button
                onClick={() => router.push('/purchasing')}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50"
              >
                Back to POs
              </button>
            </div>
          </div>
        </div>

        {/* Printable QR label sheet: one card per serialized unit with a real
            scannable QR code (PNG data URL) encoding the public warranty URL */}
        {successReceipt.labels.length > 0 && (
          <div id="qr-label-sheet">
            <div className="grid grid-cols-[repeat(auto-fill,62mm)] gap-[5mm] justify-center">
              {successReceipt.labels.map((label) => (
                <div
                  key={label.qrCode}
                  className="label-card flex flex-col justify-between border border-dashed border-slate-400 bg-white p-[3mm]"
                  style={{ width: '62mm', height: '42mm' }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[8pt] font-bold uppercase text-orange-600 tracking-wide">
                        SunPower Solar
                      </div>
                      <div className="text-[7pt] text-slate-600 max-w-[34mm] truncate">{label.productName}</div>
                    </div>
                    <div className="text-[6pt] font-mono text-slate-500">{label.sku}</div>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={label.dataUrl}
                      alt={`QR ${label.qrCode}`}
                      style={{ width: '19mm', height: '19mm', display: 'block' }}
                    />
                    <div className="flex-1 pl-[3mm] text-[6.5pt] text-slate-700">
                      <div className="font-semibold">Serial:</div>
                      <div className="font-mono text-[7.5pt] font-bold text-slate-900">{label.serialNumber}</div>
                      <div className="mt-[1mm] text-[5.5pt] text-slate-400">
                        Warranty: {label.warrantyMonths} months
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between text-[5.5pt] text-slate-400 border-t border-slate-200 pt-[1mm]">
                    <span>Scan for warranty &amp; unit history</span>
                    <span>{label.receiptDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <button
          onClick={() => router.back()}
          className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <PackageCheck className="w-7 h-7 text-orange-600" />
            <span>Receive Goods & Serial Capture (Screen S12)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Capture incoming supplier deliveries, record serial numbers with live camera scanner, and generate unit QR codes.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmitReceipt} className="space-y-6">
        {/* Receipt Header Details */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Purchase Order (Optional)</span>
            </label>
            <select
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 bg-white"
            >
              <option value="">-- Standalone Receipt (No PO) --</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} · {po.supplierName} ({po.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>Receiving Warehouse *</span>
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 bg-white"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Supplier Invoice / DC Ref</span>
            </label>
            <input
              type="text"
              placeholder="e.g. INV-2026-9901"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Lines Section */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <span>Line Items & Serial Numbers ({lines.length})</span>
            </h2>
            <button
              type="button"
              onClick={addEmptyLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 p-4 space-y-6">
            {lines.map((line, idx) => {
              const selectedProduct = products.find((p) => p.id === line.productId);
              const isComplete = !line.isSerialized || line.serialNumbers.length === line.qty;

              return (
                <div key={idx} className="pt-4 first:pt-0 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Product */}
                    <div className="sm:col-span-5">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Product SKU & Name
                      </label>
                      <select
                        value={line.productId}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} - {p.name} {p.is_serialized ? '(Serialized)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Qty ({selectedProduct?.uom || 'units'})
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={line.qty}
                        onChange={(e) => handleQtyChange(idx, parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>

                    {/* Unit Cost */}
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Unit Cost (Rs.)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={line.unitCostRupees}
                        onChange={(e) => handleCostChange(idx, parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>

                    {/* Remove */}
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30"
                        title="Remove line"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Serial Number Capture Box (if serialized) */}
                  {line.isSerialized && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Barcode className="w-4 h-4 text-orange-600" />
                          <span className="text-xs font-semibold text-slate-800">
                            Serialized Units ({line.serialNumbers.length} / {line.qty} Scanned)
                          </span>
                          {isComplete ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              Need {line.qty - line.serialNumbers.length} more
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveScannerLineIdx(idx)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Scan with Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkPasteLineIdx(idx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100"
                          >
                            <span>Bulk Paste</span>
                          </button>
                        </div>
                      </div>

                      {/* Manual Serial Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type or paste serial barcode..."
                          value={activeScannerLineIdx === null ? manualSerialInput : ''}
                          onChange={(e) => setManualSerialInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addManualSerial(idx);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-orange-500 uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => addManualSerial(idx)}
                          className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700"
                        >
                          Add Serial
                        </button>
                      </div>

                      {/* Scanned Serial Chips */}
                      {line.serialNumbers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {line.serialNumbers.map((serial) => (
                            <span
                              key={serial}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-800 text-xs font-mono shadow-2xs"
                            >
                              <span>{serial}</span>
                              <button
                                type="button"
                                onClick={() => removeSerial(idx, serial)}
                                className="text-slate-400 hover:text-rose-600 ml-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-8 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <span>Receiving Goods...</span>
            ) : (
              <>
                <PackageCheck className="w-4 h-4" />
                <span>Confirm Stock Receipt</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Live Camera Scanner Modal */}
      {activeScannerLineIdx !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-4 border border-slate-800 text-white space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-orange-500" />
                  <span>Scan Serial Barcode</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Aim camera at unit barcode or QR label. Audio & haptic chime on detection.
                </p>
              </div>
              <button
                onClick={() => setActiveScannerLineIdx(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-700">
              <Scanner
                onScan={handleScan}
                active={activeScannerLineIdx !== null}
              />
            </div>

            <div className="text-center text-xs text-slate-400">
              Scanned: {lines[activeScannerLineIdx]?.serialNumbers.length || 0} /{' '}
              {lines[activeScannerLineIdx]?.qty || 1} units
            </div>

            <button
              onClick={() => setActiveScannerLineIdx(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold text-white"
            >
              Done Scanning
            </button>
          </div>
        </div>
      )}

      {/* Bulk Paste Modal */}
      {bulkPasteLineIdx !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900">Bulk Paste Serial Numbers</h3>
              <button onClick={() => setBulkPasteLineIdx(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Paste comma, tab, or newline-separated serial numbers from your packing list or barcode scanner.
            </p>
            <textarea
              rows={6}
              value={bulkPasteText}
              onChange={(e) => setBulkPasteText(e.target.value)}
              placeholder="SN-INV-001&#10;SN-INV-002&#10;SN-INV-003"
              className="w-full p-3 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkPasteLineIdx(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyBulkPaste(bulkPasteLineIdx)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold"
              >
                Add Serials
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
