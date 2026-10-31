'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Sun,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  Smartphone,
  Wrench,
  Package,
  Headphones,
  CreditCard,
  Briefcase,
} from 'lucide-react';

interface DemoRole {
  title: string;
  role: string;
  email: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const DEMO_ROLES: DemoRole[] = [
  {
    title: 'Director',
    role: 'DIRECTOR',
    email: 'director@sunpower.ops',
    description: 'Executive P&L, margin overrides & company oversight',
    icon: Briefcase,
    color: 'border-amber-500/40 hover:border-amber-400 bg-amber-500/10 text-amber-300',
  },
  {
    title: 'Sales Lead',
    role: 'SALES',
    email: 'sales1@sunpower.ops',
    description: 'CRM leads, site survey reviews & BOM quotations',
    icon: UserCheck,
    color: 'border-blue-500/40 hover:border-blue-400 bg-blue-500/10 text-blue-300',
  },
  {
    title: 'Field Tech Lead',
    role: 'TECHNICIAN',
    email: 'tech1@sunpower.ops',
    description: 'Rooftop field PWA, daily time logs & step sign-offs',
    icon: Wrench,
    color: 'border-orange-500/40 hover:border-orange-400 bg-orange-500/10 text-orange-300',
  },
  {
    title: 'Warehouse Ops',
    role: 'WAREHOUSE',
    email: 'warehouse@sunpower.ops',
    description: 'Stock intake, barcode scanning & dispatch staging',
    icon: Package,
    color: 'border-purple-500/40 hover:border-purple-400 bg-purple-500/10 text-purple-300',
  },
  {
    title: 'Customer Support',
    role: 'SUPPORT',
    email: 'support@sunpower.ops',
    description: 'Service desk, SLA tracking & 20-year warranty claims',
    icon: Headphones,
    color: 'border-emerald-500/40 hover:border-emerald-400 bg-emerald-500/10 text-emerald-300',
  },
  {
    title: 'Accounts & Finance',
    role: 'ACCOUNTS',
    email: 'accounts@sunpower.ops',
    description: 'Payment receipts, bank reconciliation & ledger audits',
    icon: CreditCard,
    color: 'border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/10 text-cyan-300',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isFieldDevice, setIsFieldDevice] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);

  async function handleLogin(e?: React.FormEvent, customEmail?: string, customPassword?: string) {
    if (e) e.preventDefault();

    const targetEmail = customEmail || email;
    const targetPassword = customPassword || password;

    if (!targetEmail.trim() || !targetPassword) {
      setErrorMessage('Please enter both your work email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setIsLocked(false);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail.trim(),
          password: targetPassword,
          isFieldDevice,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 423 || data.code === 'ACCOUNT_LOCKED') {
          setIsLocked(true);
          setRemainingMinutes(data.remainingMinutes || 15);
          setErrorMessage(
            data.message || 'Account temporarily locked due to 10 failed login attempts. Please try again after 15 minutes.'
          );
        } else {
          setErrorMessage(data.message || 'Authentication failed. Please check your credentials.');
        }
        return;
      }

      // Successful login
      const target = redirectTarget || data.redirectTo || '/dashboard';
      router.push(target);
      router.refresh();
    } catch {
      setErrorMessage('Unable to communicate with authentication service. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickDemoSelect(demoEmail: string) {
    const defaultPassword = 'SunPower@2026';
    setEmail(demoEmail);
    setPassword(defaultPassword);
    if (demoEmail === 'tech1@sunpower.ops') {
      setIsFieldDevice(true);
    }
    handleLogin(undefined, demoEmail, defaultPassword);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-800/80">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <Sun className="w-6 h-6" />
          </div>
          <div>
            <span className="font-extrabold text-lg text-white tracking-tight">SunPower Ops</span>
            <span className="text-xs block text-amber-400 font-medium">Solar Installation Management System</span>
          </div>
        </Link>

        <Link
          href="/portal"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-white transition flex items-center gap-1.5"
        >
          <span>Customer Portal</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto py-8">
        {/* Left Column: Login Form */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">Staff Sign In</h1>
            <p className="text-xs text-slate-400 mt-1">
              Role-based access for operations, sales, field crew, inventory & finance.
            </p>
          </div>

          {/* Account Locked Alert (TRD 2.6) */}
          {isLocked && (
            <div className="mb-5 p-4 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-200 text-xs flex gap-3 items-start animate-pulse">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Account Temporarily Locked</p>
                <p className="mt-1 text-rose-200/90 leading-relaxed">
                  10 consecutive failed login attempts reached. As required by SunPower security policy (Spec 2.6), this account is locked for {remainingMinutes ?? 15} minutes.
                </p>
              </div>
            </div>
          )}

          {/* Standard Error Alert */}
          {errorMessage && !isLocked && (
            <div className="mb-5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/30 text-amber-200 text-xs flex gap-2.5 items-center">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Work Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. director@sunpower.ops"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
                <span className="text-[11px] text-slate-500">Argon2id Encrypted</span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Field Device Checkbox */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                id="fieldDevice"
                type="checkbox"
                checked={isFieldDevice}
                onChange={(e) => setIsFieldDevice(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <label htmlFor="fieldDevice" className="text-xs text-slate-300 cursor-pointer select-none leading-relaxed">
                <span className="font-medium text-white flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  Field Device (PWA 30-Day Session)
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Staff sessions expire after 12 idle hours; field device sessions stay active for 30 days (Spec 2.6).
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 text-sm flex items-center justify-center gap-2 transition"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to SolarOS</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Customer Callout */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400">
              Are you a solar rooftop customer?
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Customers never log in with passwords. Use the secure link sent to your SMS/WhatsApp, or look up your 20-year warranty at the{' '}
              <Link href="/portal" className="text-emerald-400 hover:underline font-medium">
                Customer Portal
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Right Column: Demo Role Quick Select */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">Role-Based Access Control (RBAC) Demo</h2>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                Spec v1.1 Matrix
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Click any of the 6 specification roles below to instantly log in as that persona and verify their tailored navigation, permissions, and security boundaries.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {DEMO_ROLES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => handleQuickDemoSelect(item.email)}
                    disabled={loading}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between group hover:scale-[1.01] ${item.color}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-white flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950/60 border border-white/10 text-slate-300">
                          {item.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300/80 leading-normal">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-400">{item.email}</span>
                      <span className="font-semibold underline group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                        Sign in <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Default seed password: <code className="text-amber-400 font-mono font-semibold">SunPower@2026</code></span>
              <span className="text-slate-500">10 failed tries = 15m lockout</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto pt-6 border-t border-slate-800/80 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span>SunPower Ops · Next.js · PostgreSQL · Pure Domain Engines · 100% Traceability</span>
        <div className="flex items-center gap-4 text-[11px]">
          <Link href="/enquiry" className="hover:text-slate-300">Public Enquiry</Link>
          <Link href="/portal" className="hover:text-slate-300">Customer Portal</Link>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Spec TRD 2.6 Compliant
          </span>
        </div>
      </footer>
    </div>
  );
}
