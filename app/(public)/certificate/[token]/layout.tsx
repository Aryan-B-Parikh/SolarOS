import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Handover & Commissioning Certificate | SunPower Solar Systems',
  description: 'Official verified solar system commissioning certificate and technical sign-off.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CertificateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-xs">
              <span className="text-base">📜</span>
            </div>
            <div>
              <span className="text-sm font-extrabold text-slate-900 tracking-tight block leading-tight">
                SunPower
              </span>
              <span className="text-[10px] text-amber-700 font-semibold tracking-wider uppercase block">
                Commissioning & Handover System
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Cryptographically Verified Handover</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto px-4 py-8 flex-1">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700">
            SunPower Solar Systems Pvt Ltd • ISO 9001:2015 Certified Solar EPC
          </p>
          <p className="text-[11px] text-slate-400">
            Tamper-evident certificate secured by SHA-256 digital proof integrity hash.
          </p>
        </div>
      </footer>
    </div>
  );
}

