import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Equipment Warranty Verification | SunPower Solar Systems',
  description: 'Official serialized equipment warranty verification and authenticity lookup.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PublicWarrantyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-xs">
              <span className="text-base">🛡️</span>
            </div>
            <div>
              <span className="text-sm font-extrabold text-slate-900 tracking-tight block leading-tight">
                SunPower
              </span>
              <span className="text-[10px] text-amber-700 font-semibold tracking-wider uppercase block">
                Warranty Verification System
              </span>
            </div>
          </div>
          <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            ✓ Authentic Serialized Unit
          </div>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 flex-1">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-3xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700">
            SunPower Solar Systems Pvt Ltd • Customer Support: +91 98765 43210
          </p>
          <p className="text-[11px] text-slate-400">
            Rule D14: Confidential customer identity redacted. Displays equipment warranty status only.
          </p>
        </div>
      </footer>
    </div>
  );
}

