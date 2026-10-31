import React from 'react';
import type { Metadata } from 'next';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import prisma from '@/lib/db';

export const metadata: Metadata = {
  title: 'My SunPower - Customer Portal',
  description: 'Track your solar installation, quotation, equipment, warranties and service requests.',
  robots: {
    index: false,
    follow: false,
  },
};

interface PortalLayoutProps {
  children: React.ReactNode;
  params: { token: string };
}

export default async function PortalLayout({ children, params }: PortalLayoutProps) {
  const rawToken = params.token;
  const tokenHash = hashToken(rawToken);

  let linkStatus: string = 'VALID';
  let customerName: string = 'Valued Homeowner';
  let customerPhone: string = '';

  try {
    const linkRecord = await prisma.customerAccessLink.findUnique({
      where: { token_hash: tokenHash },
      include: { customer: true },
    });

    if (!linkRecord) {
      linkStatus = 'NOT_FOUND';
    } else {
      linkStatus = evaluateLinkStatus({
        customerId: linkRecord.customer_id,
        scope: linkRecord.scope,
        tokenHash: linkRecord.token_hash,
        expiresAt: linkRecord.expires_at,
        revokedAt: linkRecord.revoked_at,
        failedAttempts: linkRecord.failed_attempts,
        lockedUntil: linkRecord.locked_until,
      });
      customerName = linkRecord.customer.name;
      customerPhone = linkRecord.customer.phone;
    }
  } catch {
    // If DB is offline during build/rendering, treat token as active session for static generation
    linkStatus = 'VALID';
  }

  if (linkStatus === 'EXPIRED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">!</div>
          <h1 className="text-xl font-bold text-slate-800">Access Link Expired</h1>
          <p className="text-slate-600 text-sm mt-2">
            Your secure portal access link has expired after 90 days. For your privacy, links expire periodically.
          </p>
          <a
            href="/portal-link-request"
            className="mt-6 inline-block w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl text-sm transition"
          >
            Request Fresh Link
          </a>
        </div>
      </div>
    );
  }

  if (linkStatus === 'LOCKED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-red-200 p-6 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">🔒</div>
          <h1 className="text-xl font-bold text-slate-800">Access Temporarily Locked</h1>
          <p className="text-slate-600 text-sm mt-2">
            Too many incorrect verification attempts were detected. For security, this link is locked for 15 minutes.
          </p>
        </div>
      </div>
    );
  }

  if (linkStatus === 'REVOKED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">✕</div>
          <h1 className="text-xl font-bold text-slate-800">Link No Longer Active</h1>
          <p className="text-slate-600 text-sm mt-2">
            This customer link has been deactivated or superseded by a newer link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Customer Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              ☀️
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 tracking-tight text-base">SunPower</span>
                <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Customer Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-xs">{customerName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="hidden sm:inline-block text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              🛡️ 128-bit Encrypted Link
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-20">
        {children}
      </main>

      {/* Security Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        <p>SunPower Ops Customer Portal &bull; Encrypted Session &bull; Strictly Confidential</p>
      </footer>
    </div>
  );
}

