import React from 'react';
import type { Metadata } from 'next';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import prisma from '@/lib/db';

export const metadata: Metadata = {
  title: 'Solar System Quotation | SunPower Solar Systems',
  description: 'Review your customized rooftop solar quotation, itemized BOM parts list, and savings estimate.',
  robots: {
    index: false,
    follow: false,
  },
};

interface QuoteLayoutProps {
  children: React.ReactNode;
  params: { token: string };
}

export default async function QuoteLayout({ children, params }: QuoteLayoutProps) {
  const rawToken = params.token;
  const tokenHash = hashToken(rawToken);

  let linkStatus: string = 'VALID';
  let remainingLockMins = 15;

  try {
    const linkRecord = await prisma.customerAccessLink.findUnique({
      where: { token_hash: tokenHash },
    });

    if (linkRecord) {
      linkStatus = evaluateLinkStatus({
        customerId: linkRecord.customer_id,
        scope: linkRecord.scope,
        tokenHash: linkRecord.token_hash,
        expiresAt: linkRecord.expires_at,
        revokedAt: linkRecord.revoked_at,
        failedAttempts: linkRecord.failed_attempts,
        lockedUntil: linkRecord.locked_until,
      });

      if (linkRecord.locked_until) {
        const remainingMs = new Date(linkRecord.locked_until).getTime() - Date.now();
        remainingLockMins = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
      }
    }
  } catch {
    linkStatus = 'VALID';
  }

  if (linkStatus === 'LOCKED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-red-200 p-6 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            🔒
          </div>
          <h1 className="text-xl font-bold text-slate-800">Quotation Link Locked</h1>
          <p className="text-slate-600 text-sm mt-2">
            Too many incorrect verification attempts were detected. For your security, this quote link has been locked for {remainingLockMins} minutes.
          </p>
          <p className="text-xs text-slate-400 mt-4">
            Security Rule D11 • SunPower Secure Customer Links
          </p>
        </div>
      </div>
    );
  }

  if (linkStatus === 'REVOKED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            ✕
          </div>
          <h1 className="text-xl font-bold text-slate-800">Quotation Link Revoked</h1>
          <p className="text-slate-600 text-sm mt-2">
            This quote link is no longer active. It may have been superseded by a revised quote from your solar advisor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-sm">
              <span className="text-lg">☀️</span>
            </div>
            <div>
              <span className="text-base font-extrabold text-slate-900 tracking-tight block leading-tight">
                SunPower
              </span>
              <span className="text-[10px] text-amber-700 font-semibold tracking-wider uppercase block">
                Official Solar Quotation
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Secure Customer Portal</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 space-y-2">
          <p className="font-semibold text-slate-700">
            SunPower Solar Systems Pvt. Ltd. • ISO 9001 Certified Solar EPC
          </p>
          <p className="text-[11px] text-slate-400">
            CIN: U40106GJ2020PTC115432 • GSTIN: 24AAACS1429B1Z8 • Authorized MNRE Channel Partner
          </p>
          <p className="text-[10px] text-slate-400">
            Confidential customer document. Secured with 128-bit cryptographic tokens.
          </p>
        </div>
      </footer>
    </div>
  );
}
