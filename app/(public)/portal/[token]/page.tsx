import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import {
  hashToken,
  evaluateLinkStatus,
  VERIFIED_SESSION_COOKIE_NAME,
  validateVerifiedSessionToken,
} from '@/lib/access-links';
import { formatDateIST } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { WarrantyBar } from '@/components/WarrantyBar';
import { ExternalLink, FileDown, Phone } from 'lucide-react';
import PortalTicketsClient from './PortalTicketsClient';

interface PortalPageProps {
  params: { token: string };
}

const FALLBACK_COMPANY_PHONE = '+91 98250 12345';

export default async function CustomerPortalPage({ params }: PortalPageProps) {
  const rawToken = params.token;
  const tokenHash = hashToken(rawToken);

  let customer: any = null;
  let currentLead: any = null;
  let currentQuote: any = null;
  let currentOrder: any = null;
  let warranties: any[] = [];
  let serviceTickets: any[] = [];
  let payments: any[] = [];
  let invoices: any[] = [];
  let installedUnits: any[] = [];
  let beforePhotos: any[] = [];
  let afterPhotos: any[] = [];
  let faultCatalogue: Record<string, Array<{ code: string; description: string; defaultPriority: string }>> = {};
  let companyPhone = FALLBACK_COMPANY_PHONE;
  let isVerifiedSession = false;

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
            service_tickets: { orderBy: { created_at: 'desc' } },
          },
        },
      },
    });

    if (link && evaluateLinkStatus({
      customerId: link.customer_id,
      scope: link.scope,
      tokenHash: link.token_hash,
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      failedAttempts: link.failed_attempts,
      lockedUntil: link.locked_until,
    }) === 'VALID') {
      customer = link.customer;
      currentLead = link.customer.leads[0] || null;
      currentQuote = link.customer.quotes[0] || null;
      currentOrder = link.customer.orders[0] || null;
      warranties = link.customer.warranties || [];
      serviceTickets = link.customer.service_tickets || [];

      // FR-10.4 (a): serialized installed units from the installation/order chain
      installedUnits = currentOrder?.installation?.inventory_units || [];

      // D11: is the 30-minute verified session cookie valid for this portal link?
      const verifiedCookie = cookies().get(VERIFIED_SESSION_COOKIE_NAME)?.value;
      isVerifiedSession = !!(
        verifiedCookie &&
        validateVerifiedSessionToken(verifiedCookie, hashToken(rawToken), customer.id)
      );

      // FR-10.8: payments across all of the customer's orders + invoices
      const [paymentRows, invoiceRows, faultCodeRows, phoneSetting, brandingSetting] = await Promise.all([
        prisma.payment.findMany({
          where: { order: { customer_id: customer.id }, status: { not: 'REVERSED' } },
          include: { order: { select: { order_number: true } } },
          orderBy: { received_on: 'desc' },
        }),
        prisma.invoice.findMany({
          where: { customer_id: customer.id, status: { not: 'CANCELLED' } },
          orderBy: { issue_date: 'desc' },
        }),
        prisma.faultCode.findMany({ orderBy: [{ product_model: 'asc' }, { code: 'asc' }] }),
        prisma.setting.findUnique({ where: { key: 'company_phone' } }),
        prisma.setting.findUnique({ where: { key: 'company_branding' } }),
      ]);
      payments = paymentRows;
      invoices = invoiceRows;

      // FR-7.9: fault codes from the DB for the portal ticket form
      for (const row of faultCodeRows) {
        if (!faultCatalogue[row.product_model]) faultCatalogue[row.product_model] = [];
        faultCatalogue[row.product_model].push({
          code: row.code,
          description: row.description,
          defaultPriority: row.default_priority,
        });
      }

      // FR-10.7 (task 7): company contact number (Setting 'company_phone',
      // then company_branding.phone, then a fixed fallback).
      const directPhone = phoneSetting?.value;
      if (typeof directPhone === 'string' && directPhone.length) {
        companyPhone = directPhone;
      } else {
        const brandingPhone = (brandingSetting?.value as any)?.phone;
        if (typeof brandingPhone === 'string' && brandingPhone.length) {
          companyPhone = brandingPhone;
        }
      }

      // FR-10.4 (b): before (survey) / after (installation) photo galleries
      const surveyId: string | null = currentLead?.survey?.id || null;
      const installationId: string | null = currentOrder?.installation?.id || null;
      const galleryKinds = ['SURVEY', 'BEFORE', 'AFTER', 'ARRAY', 'INVERTER', 'EARTHING', 'OTHER'];
      const [surveyPhotos, installationPhotos] = await Promise.all([
        surveyId
          ? prisma.attachment.findMany({
              where: {
                owner_type: 'SURVEY',
                owner_id: surveyId,
                mime: { startsWith: 'image/' },
                kind: { in: galleryKinds as any },
              },
              orderBy: { created_at: 'asc' },
            })
          : Promise.resolve([]),
        installationId
          ? prisma.attachment.findMany({
              where: {
                owner_type: 'INSTALLATION',
                owner_id: installationId,
                mime: { startsWith: 'image/' },
                kind: { in: galleryKinds as any },
              },
              orderBy: { created_at: 'asc' },
            })
          : Promise.resolve([]),
      ]);
      beforePhotos = surveyPhotos;
      afterPhotos = installationPhotos;
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

  // Tickets serialized for the client component (using ticket_number as id so NO internal UUID is leaked)
  const portalTickets = serviceTickets.map((t: any) => ({
    id: t.ticket_number,
    ticketNumber: t.ticket_number,
    category: t.category,
    faultCode: t.fault_code,
    description: t.description,
    priority: t.priority,
    status: t.status,
    warrantyVerdict: t.warranty_verdict,
    billingMode: t.billing_mode,
    slaDueAt: t.sla_due_at instanceof Date ? t.sla_due_at.toISOString() : String(t.sla_due_at),
    createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
    resolvedAt: t.resolved_at ? (t.resolved_at instanceof Date ? t.resolved_at.toISOString() : String(t.resolved_at)) : null,
    resolutionNotes: t.resolution_notes || null,
  }));

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
                Phase 4 • Order &amp; Installation Schedule
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

            {/* Assigned crew lead — with company contact number (FR-10.7) */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Crew Lead</span>
              <div className="text-base font-extrabold text-slate-800">
                {installation?.crew_lead?.name || 'SunPower Field Team'}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold">Certified Rooftop Installer</div>
              <div className="text-[11px] text-slate-600 font-semibold flex items-center gap-1.5 pt-0.5">
                <Phone className="w-3 h-3 text-amber-600" />
                <a href={`tel:${companyPhone.replace(/\s/g, '')}`} className="hover:text-amber-700">
                  {companyPhone}
                </a>
                <span className="text-slate-400 font-normal">(company helpline)</span>
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

        {/* Phase 5: Warranty Protection — ALL units with WarrantyBar + PDF (FR-10.5) */}
        <div id="warranties" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phase 5 • Hardware &amp; Warranty</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  warranties.length > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {warranties.length > 0 ? `${warranties.length} Units Covered` : 'Not Activated'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Warranty Protection</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              25 Years panel linear performance warranty &bull; 5 Years inverter replacement warranty. All units registered with tamper-evident QR codes.
            </p>

            {warranties.length > 0 && (
              <div className="mt-3 space-y-3">
                {warranties.map((w) => {
                  const unitIdentifier = w.unit?.qr_code || w.unit?.serial_number;
                  return (
                    <div key={unitIdentifier || w.start_date.toISOString()} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {w.unit?.product?.name || w.product?.name || 'Equipment Unit'}
                          {w.unit?.serial_number && (
                            <span className="font-mono text-[10px] text-slate-500 ml-1.5">
                              S/N {w.unit.serial_number}
                            </span>
                          )}
                        </span>
                        {unitIdentifier && (
                          <a
                            href={`/api/v1/portal/${encodeURIComponent(rawToken)}/warranty/${encodeURIComponent(unitIdentifier)}/pdf`}
                            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition"
                          >
                            <FileDown className="w-3 h-3" /> Warranty certificate (PDF)
                          </a>
                        )}
                      </div>
                      <WarrantyBar
                        startDate={w.start_date}
                        endDate={w.end_date}
                        status={w.status as 'ACTIVE' | 'VOID' | 'TRANSFERRED' | 'EXPIRED'}
                      />
                    </div>
                  );
                })}
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

        {/* Phase 6: Handover Certificate & Before/After Gallery Card (FR-10.4) */}
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
            <h4 className="text-base font-bold text-slate-800">Handover Certificate &amp; Photos</h4>
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
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              {isCertificateIssued ? 'Tamper-Evident Proof' : 'Available After Handover'}
            </span>
            {isCertificateIssued ? (
              <div className="flex items-center gap-2">
                <Link
                  href={`/certificate/${rawToken}`}
                  className="text-xs font-bold text-slate-800 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-1.5 rounded-xl transition"
                >
                  View Certificate →
                </Link>
                <a
                  href={`/certificate/${rawToken}?pdf=1`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition"
                >
                  <FileDown className="w-3.5 h-3.5" /> Download PDF
                </a>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3.5 py-1.5 rounded-xl">
                Pending Installation
              </span>
            )}
          </div>
        </div>

        {/* Installed Equipment with serials + monitoring links (FR-10.4a / FR-10.9) */}
        <div id="equipment" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Installed Equipment</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  installedUnits.length > 0
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {installedUnits.length > 0 ? `${installedUnits.length} Units` : 'Pending Install'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Your Solar Hardware</h4>
            {installedUnits.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {installedUnits.map((unit: any) => (
                  <li
                    key={unit.qr_code || unit.serial_number || unit.product?.sku}
                    className="bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">
                        {unit.product?.name || 'Equipment'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        S/N {unit.serial_number} • {unit.product?.brand} {unit.product?.model}
                      </div>
                    </div>
                    {unit.product?.monitoring_url && (
                      <a
                        href={unit.product.monitoring_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition"
                      >
                        <ExternalLink className="w-3 h-3" /> Monitoring app
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Serial numbers of your panels, inverter and battery will appear here once the crew
                scans them during installation.
              </p>
            )}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500">
              Every unit is QR-registered for warranty verification
            </span>
          </div>
        </div>
      </div>

      {/* Before / After Photo Gallery (FR-10.4b) */}
      {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
        <section id="gallery" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Phase 6 • Site Gallery
              </span>
              <h3 className="text-base font-bold text-slate-800 mt-0.5">Before &amp; After Installation</h3>
            </div>
            <span className="text-[10px] text-slate-400">
              {beforePhotos.length} before • {afterPhotos.length} after
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {beforePhotos.length > 0 && (
              <div>
                <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Before — Site Survey
                </h5>
                <div className="grid grid-cols-3 gap-2">
                  {beforePhotos.map((p) => (
                    <a
                      key={p.id}
                      href={`/api/v1/attachments/${p.id}?portal=${encodeURIComponent(rawToken)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl overflow-hidden border border-slate-200 hover:ring-2 hover:ring-amber-400 transition"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/v1/attachments/${p.id}?portal=${encodeURIComponent(rawToken)}`}
                        alt="Site before installation"
                        className="w-full h-24 object-cover bg-slate-100"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {afterPhotos.length > 0 && (
              <div>
                <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  After — Commissioned System
                </h5>
                <div className="grid grid-cols-3 gap-2">
                  {afterPhotos.map((p) => (
                    <a
                      key={p.id}
                      href={`/api/v1/attachments/${p.id}?portal=${encodeURIComponent(rawToken)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl overflow-hidden border border-slate-200 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/v1/attachments/${p.id}?portal=${encodeURIComponent(rawToken)}`}
                        alt="Installed solar system"
                        className="w-full h-24 object-cover bg-slate-100"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Service Requests: raise form + full list (FR-10.6 / FR-10.7) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phase 7 • Support &amp; Service
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-0.5">Service Requests</h3>
          </div>
          <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> 24/7 Helpline: {companyPhone}
          </span>
        </div>
        <PortalTicketsClient
          token={rawToken}
          initialTickets={portalTickets}
          faultCatalogue={faultCatalogue}
          initiallyVerified={isVerifiedSession}
        />
      </section>

      {/* Payments & Invoices (FR-10.8) */}
      <section id="invoices" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phase 4 • Finance
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-0.5">Payments &amp; Invoices</h3>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {payments.length} payment{payments.length === 1 ? '' : 's'} received • {invoices.length} invoice
            {invoices.length === 1 ? '' : 's'}
          </span>
        </div>

        {payments.length === 0 && invoices.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Payment receipts and invoices will appear here once your project progresses.
          </p>
        ) : (
          <div className="space-y-5">
            {payments.length > 0 && (
              <div className="overflow-x-auto">
                <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Payment History
                </h5>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Received On</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono">{p.order?.order_number || '—'}</td>
                        <td className="px-3 py-2 font-bold">{formatPaise(p.amount_paise)}</td>
                        <td className="px-3 py-2">{p.method}</td>
                        <td className="px-3 py-2">{p.kind}</td>
                        <td className="px-3 py-2 text-slate-500">{formatDateIST(p.received_on)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              p.status === 'VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {invoices.length > 0 && (
              <div className="overflow-x-auto">
                <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Invoices
                </h5>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Issued</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {invoices.map((inv) => (
                      <tr key={inv.invoice_number}>
                        <td className="px-3 py-2 font-mono font-bold">{inv.invoice_number}</td>
                        <td className="px-3 py-2">{inv.type}</td>
                        <td className="px-3 py-2 text-slate-500">{formatDateIST(inv.issue_date)}</td>
                        <td className="px-3 py-2 font-bold">{formatPaise(inv.total_paise)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700'
                                : inv.status === 'ISSUED'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <a
                            href={`/api/v1/invoices/${encodeURIComponent(inv.invoice_number)}/pdf?portal=${encodeURIComponent(rawToken)}`}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition"
                          >
                            <FileDown className="w-3 h-3" /> Download PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
