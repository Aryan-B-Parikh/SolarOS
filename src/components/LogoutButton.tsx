'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore - cookie will be cleared server-side anyway on next request
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={busy}
      title="Sign out"
      className={className || 'text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 disabled:opacity-50'}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
    </button>
  );
}
