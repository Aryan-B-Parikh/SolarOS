import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDateIST } from '@/lib/dates';
import { signedAttachmentUrl } from '@/lib/storage';
import { loadCertificate } from './certificate-data';

interface Props {
  params: { token: string };
  searchParams?: { pdf?: string };
}

const CHECKLIST_KEYS = [
  'standsMounted',
  'panelsLaid',
  'wiringConnected',
  'earthingDone',
  'generationTested',
];

function dash(value: string | null | undefined): string {
  return value && value.length > 0 ? value : '-';
}

export default async function HandoverCertificatePage({ params, searchParams }: Props) {
  const cert = await loadCertificate(params.token);

  if (!cert) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-lg mx-auto">
        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          📜
        </div>
        <h1 className="text-xl font-bold text-slate-900">Certificate Not Found</h1>
        <p className="text-xs text-slate-500 mt-2">
          The requested commissioning certificate link is invalid or may have expired after 90 days.
        </p>
        <div className="mt-5">
          <Link
            href="/portal"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition"
          >
            Access Customer Portal
          </Link>
        </div>
      </div>
    );
  }

  // ?pdf=1 hands off to the token-gated PDF route handler, which streams the
  // real generated certificate document (Next.js pages cannot return bytes).
  if (searchParams?.pdf === '1') {
    redirect(`/certificate/${params.token}/pdf`);
  }

  const { installation: inst, certificateNumber, issued } = cert;
  const order = inst.order;
  const customer = order.customer;

  // Job matched but not yet signed off - show the honest pending state.
  if (!issued) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-lg mx-auto space-y-3">
        <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
          📄
        </div>
        <h1 className="text-xl font-bold text-slate-900">Certificate Not Yet Issued</h1>
        <p className="text-xs text-slate-500">
          The installation for order <span className="font-mono font-semibold">{order.order_number}</span>{' '}
          ({customer.name}) is currently <span className="font-bold">{String(inst.status)}</span>.
          The commissioning certificate is issued immediately after the crew completes the job and
          the customer signs off on site.
        </p>
      </div>
    );
  }

  const capacityKw = inst.installed_capacity_kw ? Number(inst.installed_capacity_kw) : null;
  const testReadingW = inst.test_reading_w ? Number(inst.test_reading_w) : null;
  const signedAtDate = inst.signed_at ? formatDateIST(inst.signed_at) : '-';
  const systemType = order.system_type ? String(order.system_type).replace('_', ' ') : '';

  const checklistRecord =
    inst.checklist && typeof inst.checklist === 'object'
      ? (inst.checklist as Record<string, unknown>)
      : {};
  const hasChecklist = CHECKLIST_KEYS.some((k) => k in checklistRecord);
  const passedCount = CHECKLIST_KEYS.filter((k) => checklistRecord[k] === true).length;

  const signature = inst.signature_attachment;

  return (
    <div className="space-y-6">
      {/* Download actions */}
      <div className="flex justify-end">
        <a
          href={`/certificate/${params.token}?pdf=1`}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition shadow-xs"
        >
          ⬇ Download PDF Certificate
        </a>
      </div>

      {/* Official Certificate Card */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 shadow-xl p-8 sm:p-12 relative overflow-hidden">
        {/* Certificate Decorative Seal Top Right */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-amber-600/30 rounded-full blur-xl pointer-events-none"></div>

        {/* Header */}
        <div className="text-center border-b-2 border-slate-100 pb-8">
          <div className="inline-flex items-center space-x-2 bg-amber-50 text-amber-800 border border-amber-200/80 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <span>☀️</span>
            <span>MNRE Grid-Connected Rooftop Solar Project</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Certificate of Installation & Commissioning
          </h1>
          <p className="text-xs text-slate-500 mt-2 max-w-xl mx-auto">
            This certifies that the rooftop solar photovoltaic system specified below has been
            installed, safety tested, synchronized to the grid, and formally accepted by the
            customer.
          </p>
          <p className="text-[11px] font-mono font-bold text-slate-400 mt-3">
            Certificate No: {certificateNumber}
          </p>
        </div>

        {/* Customer & Location Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-8 text-xs bg-slate-50/80 p-6 rounded-2xl border border-slate-200/70">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Customer & Site
            </span>
            <div className="text-base font-bold text-slate-900">{customer.name}</div>
            <div className="text-slate-600 leading-relaxed">
              {dash(customer.address)}, {dash(customer.city)} {dash(customer.pincode)}
            </div>
            <div className="text-slate-500 font-mono text-[11px]">
              Order Ref: {order.order_number}
            </div>
          </div>

          <div className="space-y-1.5 sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Engineering Commissioning
            </span>
            <div className="text-base font-bold text-slate-900">
              {capacityKw != null ? `${capacityKw} kW` : '-'} {systemType || 'System'}
            </div>
            <div className="text-emerald-700 font-semibold">Commissioning Date: {signedAtDate}</div>
            <div className="text-slate-500 text-[11px]">
              Crew Lead: {dash(inst.crew_lead?.name)}
            </div>
          </div>
        </div>

        {/* Technical Safety & Performance Measurements */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Commissioning Test Readings
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-center">
            <div className="p-4 bg-amber-50/70 border border-amber-200/60 rounded-xl">
              <span className="text-[11px] font-semibold text-amber-800 block">Tested Solar Output</span>
              <span className="text-xl font-black text-amber-900 mt-1 block font-mono">
                {testReadingW != null ? `${testReadingW.toLocaleString('en-IN')} W` : '-'}
              </span>
              <span className="text-[10px] text-amber-700/80">Synchronized active power</span>
            </div>

            <div className="p-4 bg-slate-50/70 border border-slate-200/60 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-700 block">Installed Capacity</span>
              <span className="text-xl font-black text-slate-900 mt-1 block font-mono">
                {capacityKw != null ? `${capacityKw} kW` : '-'}
              </span>
              <span className="text-[10px] text-slate-500">As recorded at sign-off</span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-4 bg-blue-50/70 border border-blue-200/60 rounded-xl">
              <span className="text-[11px] font-semibold text-blue-800 block">Installation Checklist</span>
              <span className="text-xl font-black text-blue-900 mt-1 block">
                {hasChecklist ? `${passedCount} / 5 Passed` : '-'}
              </span>
              <span className="text-[10px] text-blue-700/80">Mounting, wiring & earthing</span>
            </div>
          </div>
        </div>

        {/* Serialized Hardware Component Registry */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Certified Hardware Serial Registry
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Component</th>
                  <th className="py-2.5 px-4">Serial Number</th>
                  <th className="py-2.5 px-4 text-center">Warranty</th>
                  <th className="py-2.5 px-4 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {inst.inventory_units.length > 0 ? (
                  inst.inventory_units.map((unit) => (
                    <tr key={unit.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 font-medium text-slate-900">{unit.product.name}</td>
                      <td className="py-2.5 px-4 font-mono font-bold">{unit.serial_number}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {unit.product.warranty_months > 0
                            ? `${unit.product.warranty_months} mo`
                            : '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Link
                          href={`/w/${unit.qr_code || unit.serial_number}`}
                          className="text-amber-600 hover:text-amber-700 font-bold text-[11px]"
                        >
                          Verify QR →
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-500">-</td>
                    <td className="py-2.5 px-4 font-mono">-</td>
                    <td className="py-2.5 px-4 text-center">-</td>
                    <td className="py-2.5 px-4 text-right">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warranty Summary */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Warranty Summary
          </h3>
          {inst.warranties.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4">Coverage</th>
                    <th className="py-2.5 px-4">Scope</th>
                    <th className="py-2.5 px-4">Duration</th>
                    <th className="py-2.5 px-4">Valid Until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {inst.warranties.map((w) => (
                    <tr key={w.id}>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {String(w.coverage)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {w.coverage === 'WORKMANSHIP'
                          ? 'Full system workmanship'
                          : w.unit
                          ? w.unit.product.name
                          : 'Equipment'}
                      </td>
                      <td className="py-2.5 px-4">{w.months} months</td>
                      <td className="py-2.5 px-4 font-semibold">{formatDateIST(w.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 border border-slate-200 rounded-xl p-4">-</p>
          )}
        </div>

        {/* Digital Sign-Off & Proof Hash */}
        <div className="pt-6 border-t-2 border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Cryptographic Proof Integrity Hash (Rule D11)
            </span>
            <div className="font-mono text-[10px] bg-slate-900 text-amber-400 p-3 rounded-xl break-all shadow-inner leading-relaxed">
              {dash(inst.signoff_hash)}
            </div>
            <span className="text-[10px] text-slate-400 block">
              Immutable SHA-256 seal combining job specs, serial list, customer signature and timestamp.
            </span>
          </div>

          <div className="text-right space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Customer Digital Acceptance
            </span>
            <div className="inline-block p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl text-center min-w-[200px]">
              {signature && signature.mime.startsWith('image/') ? (
                <img
                  src={signedAttachmentUrl(signature.id, signature.storage_key)}
                  alt="Customer signature"
                  className="mx-auto h-16 object-contain"
                />
              ) : (
                <span className="text-[10px] font-semibold text-slate-400">-</span>
              )}
              <div className="font-serif italic text-lg text-slate-800 font-bold border-b border-amber-200/60 pb-1 mt-1">
                {dash(inst.signed_name)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Digitally signed on {signedAtDate}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
