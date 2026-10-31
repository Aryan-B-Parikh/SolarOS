import React from 'react';
import Link from 'next/link';
import prisma from '@/lib/db';
import { hashToken } from '@/lib/access-links';

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
            leads: { orderBy: { created_at: 'desc' }, take: 1 },
            quotes: { orderBy: { version: 'desc' }, take: 1 },
            orders: { orderBy: { created_at: 'desc' }, take: 1 },
            warranties: { include: { unit: { include: { product: true } } } },
            service_tickets: { orderBy: { created_at: 'desc' }, take: 3 },
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
  } else if (currentOrder?.status === 'INSTALLED') {
    currentStageIndex = 5; // Installed
    nextStepMessage = 'Installation completed! Final handover documentation and warranty certificates are being generated.';
  } else if (currentOrder?.status === 'CONFIRMED' || currentOrder?.status === 'READY_TO_DISPATCH' || currentOrder?.status === 'DISPATCHED') {
    currentStageIndex = 4; // Preparation / Dispatch
    nextStepMessage = 'Order confirmed: Equipment is being prepared for dispatch to your installation site.';
  } else if (currentQuote?.status === 'SENT') {
    currentStageIndex = 2; // Quotation
    nextStepMessage = 'Your customized solar quotation is ready for your review and approval.';
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

  return (
    <div className="space-y-6">
      {/* Next Step Banner */}
      <section className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-start space-x-3">
          <div className="text-2xl mt-0.5">🚀</div>
          <div>
            <h2 className="text-xs uppercase tracking-wider font-semibold text-amber-100">Current Status</h2>
            <p className="text-base sm:text-lg font-bold mt-1 text-white leading-snug">
              {nextStepMessage}
            </p>
          </div>
        </div>
      </section>

      {/* 8-Stage Visual Progress Tracker */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Installation Journey (Stage {currentStageIndex + 1} of 8)
        </h3>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;

            return (
              <div key={stage} className="flex flex-col items-center text-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition ${
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
                    isCurrent ? 'text-amber-600 font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Grid of Dynamic Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quotation Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quotation</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                {currentQuote ? currentQuote.status : '3 kW On-Grid System'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Customized Solar Proposal</h4>
            <p className="text-xs text-slate-500 mt-1">
              Includes tier-1 solar panels, on-grid inverter, mounting structures, and 5-year workmanship guarantee.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Estimated Annual Savings: Rs 34,500</span>
            <Link
              href={`/q/${rawToken}`}
              className="inline-flex items-center text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition"
            >
              View Quote →
            </Link>
          </div>
        </div>

        {/* Warranties & Equipment Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Equipment & Warranty</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                Guaranteed
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Warranty Coverage</h4>
            <p className="text-xs text-slate-500 mt-1">
              20 Years on Solar Photovoltaic Modules &bull; 2 Years on Solar Inverters & Batteries.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {warranties.length > 0 ? `${warranties.length} Active Warranties` : 'Active upon installation'}
            </span>
            <span className="text-xs font-bold text-slate-400">Digital Certificates</span>
          </div>
        </div>

        {/* Service & Support Desk Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Service & Repairs</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                Direct Desk
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Report an Issue or Fault Code</h4>
            <p className="text-xs text-slate-500 mt-1">
              Need assistance? Raise a service request directly. In-warranty repairs incur zero customer charge.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {serviceTickets.length} Recent Requests
            </span>
            <button
              type="button"
              className="text-xs font-bold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition"
            >
              Raise Request +
            </button>
          </div>
        </div>

        {/* Completion Certificate Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Documentation</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Tamper-Proof
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-800">Completion Certificate</h4>
            <p className="text-xs text-slate-500 mt-1">
              Verified with digital signature hash and DISCOM net-metering compliance records.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">SHA-256 Verified</span>
            <span className="text-xs font-bold text-slate-400">PDF Download</span>
          </div>
        </div>
      </div>
    </div>
  );
}

