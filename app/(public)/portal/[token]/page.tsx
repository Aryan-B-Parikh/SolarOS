import React from 'react';
import Link from 'next/link';
import prisma from '@/lib/db';
import { hashToken } from '@/lib/access-links';
import { formatDateIST } from '@/lib/dates';
import { formatPaise } from '@/lib/money';

interface PortalPageProps {
  params: { token: string };
}

export default async function CustomerPortalPage({ params }: PortalPageProps) {
  const rawToken = params.token;
  const tokenHash = hashToken(rawToken);

  let customer: any = null;
  let currentLead: any = null;
  let currentQuote: any = null;
  let currentOrder: any = null;
  let warranties: any[] = [];
  let serviceTickets: any[] = [];

  try {
    const link = await prisma.customerAccessLink.findUnique({
      where: { token_hash: tokenHash },
      include: {
        customer: {
          include: {
            leads: {
              include: { survey: true, assessment: true },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
            quotes: {
              where: {
                status: { in: ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] },
              },
              include: { lines: { include: { product: true } } },
              orderBy: { version: 'desc' },
              take: 1,
            },
            orders: {
              include: {
                payments: true,
                lines: { include: { product: true } },
                installation: {
                  include: {
                    crew_lead: true,
                    inventory_units: { include: { product: true } },
                  },
                },
              },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
            warranties: {
              include: {
                unit: { include: { product: true } },
                product: true,
              },
              orderBy: { end_date: 'desc' },
            },
            service_tickets: { orderBy: { created_at: 'desc' }, take: 5 },
          },
        },
      },
    });

    if (link) {
      customer = link.customer;
      currentLead = link.customer.leads[0] || null;
      currentQuote = link.customer.quotes[0] || null;
      currentOrder = link.customer.orders[0] || null;
      warranties = link.customer.warranties || [];
      serviceTickets = link.customer.service_tickets || [];
    }
  } catch {
    // Graceful offline mock for rendering
  }

  // Determine current active lifecycle stage (1 to 8)
  let currentStageIndex = 0;
  let nextStepMessage = 'Request received: Our solar engineering team is reviewing your property details.';

  if (warranties.length > 0) {
    currentStageIndex = 6; // Handover & Warranty active
    nextStepMessage = 'Your system is active and generating clean power under full SunPower warranty protection.';
  } else if (currentOrder?.status === 'CLOSED') {
    currentStageIndex = 6; // Project closed, warranty & service phase
    nextStepMessage = 'Project closed: your system is commissioned and covered by SunPower warranty and service support.';
  } else if (currentOrder?.status === 'INSTALLED') {
    currentStageIndex = 5; // Installed
    nextStepMessage = 'Installation completed! Final handover documentation and commissioning certificate are verified.';
  } else if (currentOrder?.status === 'DISPATCHED') {
    currentStageIndex = 4; // Dispatch
    nextStepMessage = 'Equipment dispatched: Hardware is en route with your installation crew.';
  } else if (currentOrder?.status === 'CONFIRMED' || currentOrder?.status === 'READY_TO_DISPATCH') {
    currentStageIndex = 3; // Order confirmed
    nextStepMessage = 'Order confirmed: Warehouse stock reserved and installation job scheduled.';
  } else if (currentOrder?.status === 'PENDING_ADVANCE') {
    currentStageIndex = 3; // Order pending advance
    nextStepMessage = 'Quotation accepted! 30% advance booking payment is awaiting receipt to confirm warehouse release.';
  } else if (currentQuote?.status === 'SENT') {
    currentStageIndex = 2; // Quotation ready
    nextStepMessage = 'Your customized solar quotation is ready for your review and digital acceptance.';
  } else if (currentLead?.status === 'SURVEY_APPROVED') {
    currentStageIndex = 2;
    nextStepMessage = 'Roof survey approved: Your solar quotation and 12-line BOM are being finalized.';
  } else if (currentLead?.status === 'SURVEY_SCHEDULED') {
    currentStageIndex = 1; // Assessment & Survey
    nextStepMessage = 'Technical site survey scheduled: Our technician will measure roof orientation, tilt, and cable run.';
  }

  const STAGES = [
    'Enquiry',
    'Assessment',
    'Quotation',
    'Order',
    'Dispatch',
    'Installation',
    'Warranty',
    'Service',
  ];

  // Calculate Advance & Payment Status (Phase 4)
  const totalPaise = currentOrder?.total_paise ? BigInt(currentOrder.total_paise) : 0n;
  const advanceRequiredPaise = currentOrder?.advance_required_paise ? BigInt(currentOrder.advance_required_paise) : 0n;
  let advancePaidPaise = 0n;
  if (currentOrder?.payments) {
    for (const p of currentOrder.payments) {
      if (p.status === 'VERIFIED') {
        advancePaidPaise += BigInt(p.amount_paise);
      }
    }
  }

  const isAdvanceReceived = advancePaidPaise >= advanceRequiredPaise && advanceRequiredPaise > 0n;
  const installation = currentOrder?.installation;
  const scheduledDateFormatted = installation?.scheduled_on ? formatDateIST(installation.scheduled_on) : null;

  const isCertificateIssued =
    !!installation && (installation.status === 'COMPLETED' || !!installation.signed_at);
  const warrantyWithQr = warranties.find((w: any) => w.unit?.qr_code);
  const assessment = currentLead?.assessment;
  const annualSavingsRupees = assessment ? Number(assessment.annual_savings_paise) / 100 : null;
  const requestedCapacity = currentLead?.requested_capacity_kw
    ? Number(currentLead.requested_capacity_kw)
    : null;
  const requestedSystemType = currentLead?.system_type_pref
    ? String(currentLead.system_type_pref).replace('_', ' ')
    : null;

  return (
    <div className="space-y-6">
      {/* Current Status Hero Banner */}
      <section className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-3xl p-6 text-white shadow-md">
        <div className="flex items-start space-x-3.5">
          <div className="text-3xl mt-0.5">🚀</div>
          <div>
            <h2 className="text-xs uppercase tracking-wider font-semibold text-amber-100">
              Current Project Status
            </h2>
            <p className="text-base sm:text-xl font-black mt-1 text-white leading-snug">
              {nextStepMessage}
            </p>
            {customer && (
              <p className="text-xs text-amber-100/90 mt-1.5">
                Property: {customer.address}, {customer.pincode}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 8-Stage Visual Progress Tracker */}
      <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Installation Journey (Stage {currentStageIndex + 1} of 8: {STAGES[currentStageIndex]})
        </h3>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;

            return (
              <div key={stage} className="flex flex-col items-center text-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition ${
                    isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                      ? 'bg-amber-500 text-white ring-4 ring-amber-100 shadow-sm'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-[11px] mt-1.5 font-medium leading-tight line-clamp-1 ${
                    isCurrent
                      ? 'text-amber-600 font-bold'
                      : isCompleted
                      ? 'text-slate-700'
                      : 'text-slate-400'
                  }`}
                >
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Phase 4: Order & Schedule Tracker Card (When Order Exists) */}
      {currentOrder && (
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Phase 4 • Order & Installation Schedule
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-0.5">
                Order #{currentOrder.order_number} ({currentOrder.capacity_kw} kW {currentOrder.system_type?.replace('_', ' ')})
              </h3>
            </div>
            <span
              className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${
                currentOrder.status === 'INSTALLED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : currentOrder.status === 'DISPATCHED'
                  ? 'bg-blue-100 text-blue-800'
                  : currentOrder.status === 'CONFIRMED'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              Status: {currentOrder.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Advance payment milestone */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Advance Milestone (30%)</span>
              <div className="text-base font-extrabold text-slate-800 font-mono">
                {formatPaise(advanceRequiredPaise)}
              </div>
              <div className="flex items-center space-x-1.5 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isAdvanceReceived ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                ></span>
                <span className="text-[11px] font-semibold text-slate-600">
                  {isAdvanceReceived ? 'Advance Received' : 'Pending Receipt'}
                </span>
              </div>
            </div>

            {/* Scheduled installation date */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Scheduled Installation</span>
              <div className="text-base font-extrabold text-slate-800">
                {scheduledDateFormatted || 'Pending Confirmation'}
              </div>
              <div className="text-[11px] text-slate-500">
                Time Slot: {installation?.slot || 'Morning (09:00 AM)'}
              </div>
            </div>

            {/* Assigned crew lead */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Crew Lead</span>
              <div className="text-base font-extrabold text-slate-800">
                {installation?.crew_lead?.name || 'SunPower Field Team'}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold">
                Certified Rooftop Installer
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Grid of Dynamic Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Quotation Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quotation</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  currentQuote
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {currentQuote ? currentQuote.status : 'AWAITING QUOTE'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Solar Technical Proposal</h4>
            {currentQuote ? (
              <>
                <div className="text-xs font-semibold text-slate-700 mt-1">
                  {Number(currentQuote.capacity_kw)} kW{' '}
                  {String(currentQuote.system_type).replace('_', ' ')} system
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Includes a {currentQuote.lines?.length || 12}-line BOM parts list, PM Surya Ghar
                  subsidy estimate
                  {annualSavingsRupees
                    ? `, and estimated annual savings of ₹${annualSavingsRupees.toLocaleString('en-IN')}`
                    : ''}
                  . Review the full itemised proposal and accept it online.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {requestedCapacity
                  ? `You requested a ${requestedCapacity} kW ${requestedSystemType || 'solar'} system. `
                  : ''}
                Your technical proposal will appear here once the site survey is complete and our
                team finalises system sizing.
              </p>
            )}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {currentQuote
                ? `Ref: #${currentQuote.quote_number}`
                : requestedCapacity
                ? `${requestedCapacity} kW requested`
                : 'Custom Sizing'}
            </span>
            {currentQuote ? (
              <Link
                href={`/q/${rawToken}`}
                className="inline-flex items-center text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3.5 py-1.5 rounded-xl transition"
              >
                View Full Quote →
              </Link>
            ) : (
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3.5 py-1.5 rounded-xl">
                Awaiting Survey
              </span>
            )}
          </div>
        </div>

        {/* Phase 5: Warranties & Serialized Equipment Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phase 5 • Hardware & Warranty</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  warranties.length > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {warranties.length > 0 ? `${warranties.length} Units Active` : 'Not Activated'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Warranty Protection</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              25 Years panel linear performance warranty &bull; 5 Years inverter replacement warranty. All units registered with tamper-evident QR codes.
            </p>

            {warranties.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {warranties.slice(0, 2).map((w) => (
                  <div key={w.id} className="flex justify-between items-center text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <span className="font-medium text-slate-800">{w.product?.name || 'Equipment Unit'}</span>
                    <span className="text-emerald-700 font-bold font-mono text-[11px]">{w.months} Months</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {warranties.length > 0 ? 'Verified on registry' : 'Activated on Delivery'}
            </span>
            {warrantyWithQr ? (
              <Link
                href={`/w/${warrantyWithQr.unit.qr_code}`}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition"
              >
                Lookup QR Status →
              </Link>
            ) : (
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
                Activates on Delivery
              </span>
            )}
          </div>
        </div>

        {/* Phase 6: Handover Certificate & Before/After Gallery Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phase 6 • Documentation</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  isCertificateIssued
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {isCertificateIssued ? 'SHA-256 Verified' : 'Not Issued'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Handover Certificate & Photos</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {isCertificateIssued
                ? `Formal engineering sign-off${
                    installation.test_reading_w
                      ? `, test power reading ${Number(installation.test_reading_w).toLocaleString('en-IN')} W`
                      : ''
                  }, safety checks, earth resistance test, and before/after site inspection gallery.`
                : 'Your commissioning certificate, test power readings and before/after photo gallery are issued after installation sign-off.'}
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {isCertificateIssued ? 'Tamper-Evident Proof' : 'Available After Handover'}
            </span>
            {isCertificateIssued ? (
              <Link
                href={`/certificate/${rawToken}`}
                className="text-xs font-bold text-slate-800 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-1.5 rounded-xl transition"
              >
                View Certificate →
              </Link>
            ) : (
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3.5 py-1.5 rounded-xl">
                Pending Installation
              </span>
            )}
          </div>
        </div>

        {/* Phase 7: Service Desk & Ticket Request Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phase 7 • Support & Service</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                Direct Helpdesk
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Report Inverter Fault or Damage</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Diagnose inverter fault codes (E001-E008), report generation dips, or request scheduled cleaning. Zero charge for in-warranty service.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {serviceTickets.length} Active Tickets
            </span>
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3.5 py-1.5 rounded-xl">
              24/7 Helpline: 1800-SUN-POWER
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
