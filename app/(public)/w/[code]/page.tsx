import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDateIST } from '@/lib/dates';
import { evaluateWarrantyEligibility } from '@/domain/warranty';

interface Props {
  params: { code: string };
}

export default async function PublicWarrantyPage({ params }: Props) {
  const code = params.code.trim();

  let unit: any = null;
  try {
    unit = await prisma.inventoryUnit.findFirst({
      where: {
        OR: [{ qr_code: code }, { serial_number: code }],
      },
      include: {
        product: true,
        warranties: {
          orderBy: { end_date: 'desc' },
          take: 1,
        },
      },
    });
  } catch {
    // Graceful offline mock handling
  }

  if (!unit) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-lg mx-auto">
        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
          🔍
        </div>
        <h1 className="text-xl font-bold text-slate-900">Equipment Unit Not Found</h1>
        <p className="text-xs text-slate-500 mt-2">
          No serialized hardware matching code <strong>&ldquo;{code}&rdquo;</strong> was found in the SunPower national registry.
        </p>
        <p className="text-[11px] text-slate-400 mt-3">
          Please check the QR label or serial number printed on the inverter/panel nameplate.
        </p>
      </div>
    );
  }

  const warranty = unit.warranties[0];
  const now = new Date();

  let eligibility = { verdict: 'OUT_OF_WARRANTY', remainingDays: 0, isCovered: false };
  if (warranty) {
    eligibility = evaluateWarrantyEligibility({
      testDate: now,
      startDate: warranty.start_date,
      endDate: warranty.end_date,
      status: warranty.status as any,
    });
  }

  const isCovered = eligibility.isCovered;

  return (
    <div className="space-y-6">
      {/* Verification Seal Banner */}
      <div
        className={`rounded-2xl p-6 border shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
          isCovered
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-slate-100 border-slate-300 text-slate-800'
        }`}
      >
        <div className="flex items-start space-x-3.5">
          <span className="text-3xl">{isCovered ? '🛡️' : '⌛'}</span>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider">
              Warranty Status Verdict
            </div>
            <div className="text-xl font-extrabold mt-0.5">
              {isCovered ? 'Active Warranty Coverage' : 'Warranty Expired or Out of Scope'}
            </div>
            <p className="text-xs mt-1 text-slate-600">
              {isCovered
                ? `Covered under comprehensive SunPower manufacturer terms. ${eligibility.remainingDays} days remaining.`
                : 'Standard coverage period has elapsed. Annual maintenance and repair visits are available on chargeable basis.'}
            </p>
          </div>
        </div>

        <div className="text-right sm:border-l sm:pl-5 border-slate-200">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Remaining</div>
          <div className="text-2xl font-black font-mono">
            {eligibility.remainingDays} <span className="text-xs font-medium">Days</span>
          </div>
        </div>
      </div>

      {/* Equipment Specification Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
          Equipment Identity & Specifications
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Product Model</span>
            <span className="font-bold text-slate-800 text-sm">{unit.product.name}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Hardware Category</span>
            <span className="font-semibold text-slate-700">{unit.product.category}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Unique Serial Number</span>
            <span className="font-mono font-bold text-slate-900 text-sm bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 inline-block mt-0.5">
              {unit.serial_number}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Registry QR Code</span>
            <span className="font-mono text-slate-600">{unit.qr_code}</span>
          </div>
        </div>
      </div>

      {/* Warranty Terms Card */}
      {warranty && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
            Coverage Period & Scope
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">Start Date</span>
              <span className="font-bold text-slate-800 text-xs mt-1 block">
                {formatDateIST(warranty.start_date)}
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">Expiry Date</span>
              <span className="font-bold text-slate-800 text-xs mt-1 block">
                {formatDateIST(warranty.end_date)}
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">Total Duration</span>
              <span className="font-bold text-slate-800 text-xs mt-1 block">
                {warranty.months} Months ({warranty.months / 12} Yrs)
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">Coverage Scope</span>
              <span className="font-bold text-emerald-700 text-xs mt-1 block">
                {warranty.coverage}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Customer Service Callout */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
        <div>
          <span className="font-bold block">Need technical assistance or warranty claim?</span>
          <span className="text-[11px] text-blue-700">Open a service ticket directly from your Customer Portal.</span>
        </div>
        <Link
          href="/portal-link-request"
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition"
        >
          Customer Portal →
        </Link>
      </div>
    </div>
  );
}

