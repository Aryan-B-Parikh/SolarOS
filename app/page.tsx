import Link from 'next/link';
import { Sun, ShieldCheck, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-b from-slate-900 to-slate-950 text-white p-6">
      <div className="max-w-xl text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 text-slate-950 font-bold mb-2 shadow-lg shadow-amber-500/20">
          <Sun className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          SunPower Ops
        </h1>
        <p className="text-slate-400 text-lg">
          Solar Installation Management & 20-Year Lifecycle Warranty System
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 text-left">
          <Link
            href="/enquiry"
            className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-amber-500/50 hover:bg-slate-800 transition block group"
          >
            <div className="font-semibold text-amber-400 group-hover:text-amber-300 flex items-center justify-between">
              Public Enquiry Form <ArrowRight className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Submit solar rooftop installation request under PM Surya Ghar Muft Bijli Yojana.
            </p>
          </Link>

          <Link
            href="/dashboard"
            className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-blue-500/50 hover:bg-slate-800 transition block group"
          >
            <div className="font-semibold text-blue-400 group-hover:text-blue-300 flex items-center justify-between">
              Staff Portal <ArrowRight className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Role-based management for Director, Sales, Warehouse, Techs, Support & Accounts.
            </p>
          </Link>
        </div>

        <div className="pt-8 text-xs text-slate-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>PostgreSQL · Pure Domain Engines · Transactional Outbox · 100% Traceability</span>
        </div>
      </div>
    </div>
  );
}

