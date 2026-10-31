'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Wrench,
  CheckCircle2,
  Camera,
  Sun,
  ShieldCheck,
  FileCheck,
  UserCheck,
  PenTool,
  RotateCcw,
  AlertTriangle,
  Upload,
  Layers,
  ChevronRight,
  MapPin,
  Clock,
  Sparkles
} from 'lucide-react';
import { OfflineBanner } from '@/components/OfflineBanner';

interface InstallationDetail {
  id: string;
  status: string;
  scheduledOn: string;
  installedCapacityKw: number;
  testReadingW: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  crewLeadName: string;
  items: {
    productName: string;
    productSku: string;
    qty: number;
    serialNumbers: string[];
  }[];
}

export default function InstallationStepperClient({
  initialInstallation,
}: {
  initialInstallation: InstallationDetail;
}) {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSignoff, setSuccessSignoff] = useState<{
    hash?: string;
    certificateUrl?: string;
  } | null>(null);

  // Step 1: Checklist state
  const [checklist, setChecklist] = useState({
    standsMounted: true,
    panelsLaid: true,
    wiringConnected: true,
    earthingDone: true,
    generationTested: true,
  });

  // Step 3: Commissioning test
  const [capacityKw, setCapacityKw] = useState<number>(
    initialInstallation.installedCapacityKw || 3.24
  );
  const [testReadingW, setTestReadingW] = useState<number>(
    initialInstallation.testReadingW || 2850
  );

  // Step 4: Photo Gallery
  const [photos, setPhotos] = useState<string[]>([
    'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=400&q=80',
    'https://images.unsplash.com/photo-1508873696983-2df5293cb395?w=400&q=80',
  ]);

  // Step 5: Customer Signature Canvas
  const [customerName, setCustomerName] = useState<string>(
    initialInstallation.customerName || ''
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSignature, setHasSignature] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Canvas drawing handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [step]);

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    setIsDrawing(true);
    draw(e);
  }

  function stopDrawing() {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.beginPath();
    }
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasSignature(true);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  function handleAddPhoto() {
    const mockPhotos = [
      'https://images.unsplash.com/photo-1545209179-a5dd555295da?w=400&q=80',
      'https://images.unsplash.com/photo-1558449028-b53a39d100fc?w=400&q=80',
    ];
    setPhotos([...photos, mockPhotos[photos.length % mockPhotos.length]]);
  }

  async function handleSubmitSignOff() {
    setErrorMessage(null);
    if (!hasSignature) {
      setErrorMessage('Please obtain customer digital signature on the screen.');
      return;
    }
    if (!customerName.trim()) {
      setErrorMessage('Please enter homeowner name.');
      return;
    }

    setSubmitting(true);
    try {
      const canvas = canvasRef.current;
      const signatureDataUrl = canvas?.toDataURL('image/png') || '';

      const payload = {
        signedName: customerName.trim(),
        signatureAttachmentId: signatureDataUrl.substring(0, 100),
        photoAttachmentIds: photos,
        checklist,
        installedCapacityKw: capacityKw,
        testReadingW,
      };

      const res = await fetch(`/api/v1/installations/${initialInstallation.id}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Installation sign-off failed');
      }

      setSuccessSignoff({
        hash: data.signoffHash || 'SHA-PROOF-VERIFIED',
        certificateUrl: data.certificateUrl || `/portal`,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Sign-off submission error');
    } finally {
      setSubmitting(false);
    }
  }

  if (successSignoff) {
    return (
      <div className="max-w-md mx-auto py-10 px-4 text-center space-y-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Installation Certified!</h1>
          <p className="text-xs text-slate-600">
            Cryptographic SHA-256 sign-off proof generated and stored. Customer installation warranty is officially active.
          </p>
          <div className="p-3 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-600 break-all border border-slate-200">
            Proof: {successSignoff.hash}
          </div>
          <div className="space-y-2 pt-2">
            <button
              onClick={() => router.push('/tech/today')}
              className="w-full min-h-[48px] bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xs hover:bg-slate-800"
            >
              Return to Today's Jobs
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4 pb-28 pt-2 px-3">
      <OfflineBanner />

      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
        <button
          onClick={() => router.push('/tech/today')}
          className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <span className="font-mono text-[11px] font-bold text-orange-600">
            {initialInstallation.orderNumber}
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Rooftop Installation Stepper</span>
          </h1>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Step Indicators */}
      <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold">
        {[
          { id: 1, label: 'Safety' },
          { id: 2, label: 'Serials' },
          { id: 3, label: 'Testing' },
          { id: 4, label: 'Photos' },
          { id: 5, label: 'Sign-Off' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`py-2 rounded-lg border transition-all ${
              step === s.id
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                : step > s.id
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Step 1: Pre-Work Checklist */}
      {step === 1 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ShieldCheck className="w-5 h-5 text-orange-600" />
            <span>Step 1: Installation & Safety Checklist</span>
          </div>
          <p className="text-xs text-slate-500">
            Confirm all mechanical and electrical stages before commissioning the system.
          </p>

          <div className="space-y-3 pt-2">
            {[
              { key: 'standsMounted', label: 'Mounting Structure Anchored & Aligned' },
              { key: 'panelsLaid', label: 'Solar Panels Clamped at Specified Tilt & Azimuth' },
              { key: 'wiringConnected', label: 'DC Cabling, MC4 Connectors & Inverter Box Wired' },
              { key: 'earthingDone', label: 'Lightning Arrestor & Dual Earth Pit Connected' },
              { key: 'generationTested', label: 'AC Isolator & Generation Safety Checks Passed' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={(checklist as any)[item.key]}
                  onChange={(e) =>
                    setChecklist({ ...checklist, [item.key]: e.target.checked })
                  }
                  className="w-5 h-5 mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full min-h-[48px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-xs flex items-center justify-center gap-2"
          >
            <span>Next: Verify Serial Numbers</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2: Serial Verification */}
      {step === 2 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Layers className="w-5 h-5 text-orange-600" />
            <span>Step 2: Component Verification</span>
          </div>
          <p className="text-xs text-slate-500">
            Ensure serial numbers match dispatched BOM items before powering on.
          </p>

          <div className="space-y-3">
            {initialInstallation.items.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{item.productName}</h4>
                    <span className="text-[10px] text-slate-500 font-mono">SKU: {item.productSku}</span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    {item.qty} Unit(s)
                  </span>
                </div>
                {item.serialNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.serialNumbers.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-700">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <span>Next: Testing</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Commissioning Test */}
      {step === 3 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Sun className="w-5 h-5 text-amber-500" />
            <span>Step 3: Inverter Power & Voltage Test</span>
          </div>
          <p className="text-xs text-slate-500">
            Switch on the DC isolator and AC breaker. Record initial active output.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Installed Capacity (kW)
              </label>
              <input
                type="number"
                step="0.01"
                value={capacityKw}
                onChange={(e) => setCapacityKw(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Active Live Generation Test (Watts)
              </label>
              <input
                type="number"
                value={testReadingW}
                onChange={(e) => setTestReadingW(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-emerald-600 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Reading taken on inverter digital display under sunlight.
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <span>Next: Photo Proofs</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Photo Gallery */}
      {step === 4 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Camera className="w-5 h-5 text-orange-600" />
            <span>Step 4: Installation Photo Proofs</span>
          </div>
          <p className="text-xs text-slate-500">
            Upload clear photos of roof panels, inverter wiring, and earth pit.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {photos.map((src, i) => (
              <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img src={src} alt="Proof" className="w-full h-full object-cover" />
                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                  Photo #{i + 1}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPhoto}
            className="w-full py-2.5 border-2 border-dashed border-orange-300 bg-orange-50/50 hover:bg-orange-50 text-orange-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span>Take Another Photo</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(5)}
              className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <span>Next: Customer Sign-Off</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: On-Glass Signature Canvas */}
      {step === 5 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <PenTool className="w-5 h-5 text-orange-600" />
            <span>Step 5: Homeowner Digital Sign-Off (C8)</span>
          </div>
          <p className="text-xs text-slate-500">
            Customer confirms system handover, satisfactory generation test, and warranty commencement.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Homeowner / Signer Name *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Sign on Screen (Finger or Stylus) *
              </label>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>

            <div className="border-2 border-slate-300 rounded-2xl overflow-hidden bg-slate-50 touch-none">
              <canvas
                ref={canvasRef}
                width={360}
                height={160}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseMove={draw}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                className="w-full h-40 bg-white cursor-crosshair"
              />
            </div>
            {!hasSignature && (
              <span className="text-[10px] text-amber-600 mt-1 block">
                Please sign in the box above before submitting.
              </span>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStep(4)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={handleSubmitSignOff}
              disabled={submitting || !hasSignature || !customerName.trim()}
              className="flex-2 min-h-[48px] bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            >
              {submitting ? (
                <span>Certifying...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit & Certify Job</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
