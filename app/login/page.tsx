'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sun, Loader2, AlertCircle, Lock, Mail, UserCheck } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { role: 'DIRECTOR', label: 'Director', email: 'director@sunpower.ops' },
  { role: 'SALES', label: 'Sales Lead', email: 'sales1@sunpower.ops' },
  { role: 'TECHNICIAN', label: 'Field Tech', email: 'tech1@sunpower.ops' },
  { role: 'WAREHOUSE', label: 'Warehouse', email: 'warehouse@sunpower.ops' },
  { role: 'SUPPORT', label: 'Support', email: 'support@sunpower.ops' },
  { role: 'ACCOUNTS', label: 'Finance', email: 'accounts@sunpower.ops' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLoginWith(loginEmail: string, loginPass: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message || data?.message || 'Login failed');
        return;
      }

      // Role-specific landing route
      const role = data?.user?.role;
      const target =
        data?.redirectTo ||
        (role === 'TECHNICIAN'
          ? '/tech/today'
          : role === 'SALES'
            ? '/leads'
            : role === 'WAREHOUSE'
              ? '/inventory'
              : role === 'ACCOUNTS'
                ? '/analytics'
                : role === 'SUPPORT'
                  ? '/service'
                  : '/dashboard');

      router.push(target);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleLoginWith(email, password);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20">
            <Sun className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-4">SunPower Ops</h1>
          <p className="text-slate-400 text-sm mt-1">Staff sign-in</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-xl"
        >
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Work email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@sunpower.ops"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in…</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>

          {/* Quick Demo Logins */}
          <div className="pt-2 border-t border-slate-700/60">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-amber-400" /> Quick Demo Personas (1-Click)
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword('SunPower@2026');
                    handleLoginWith(acc.email, 'SunPower@2026');
                  }}
                  disabled={loading}
                  className="px-2 py-1.5 text-[11px] font-medium bg-slate-700/50 hover:bg-slate-700 text-slate-200 hover:text-white rounded-md border border-slate-600/50 text-center transition truncate"
                  title={`${acc.label} (${acc.email})`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Accounts lock for 30 minutes after 10 failed attempts.
            <br />
            Credentials are provisioned by the administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
