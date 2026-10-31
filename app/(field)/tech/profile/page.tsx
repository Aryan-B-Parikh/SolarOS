'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  Phone,
  Building2,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { flushOfflineQueue, getOfflineQueueCount } from '@/lib/offline-queue';

export default function TechProfilePage() {
  const router = useRouter();
  const [online, setOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/login');
    router.refresh();
  }


  useEffect(() => {
    setOnline(navigator.onLine);
    getOfflineQueueCount().then(setQueueCount).catch(() => {});

    function onOnline() { setOnline(true); }
    function onOffline() { setOnline(false); }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleManualSync() {
    if (!navigator.onLine) {
      setSyncMessage('Cannot sync while offline. Please connect to Wi-Fi or cellular network.');
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await flushOfflineQueue();
      setQueueCount(result.remaining);
      setSyncMessage(`Sync completed: ${result.synced} items uploaded, ${result.remaining} remaining.`);
    } catch (err: any) {
      setSyncMessage(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4 pb-24 pt-2 px-3">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto text-2xl font-bold">
          <User className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Field Technician Lead</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">ID: TECH-AHM-001</p>
          <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800">
            CREW LEAD · SOLAROS CERTIFIED
          </span>
        </div>
      </div>

      {/* Network & Offline Diagnostics */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Device & Connectivity Status
        </h2>

        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2.5">
            {online ? (
              <Wifi className="w-5 h-5 text-emerald-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-rose-600" />
            )}
            <div>
              <div className="text-xs font-bold text-slate-900">
                {online ? 'Online (Cloud Connected)' : 'Offline (Rooftop Mode)'}
              </div>
              <div className="text-[10px] text-slate-400">
                {online ? 'Mutations upload instantly' : 'Mutations stored in IndexedDB queue'}
              </div>
            </div>
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              online ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-xs font-bold text-slate-900">
                Offline Queue
              </div>
              <div className="text-[10px] text-slate-400">
                {queueCount} pending mutation(s) in local storage
              </div>
            </div>
          </div>
          <button
            onClick={handleManualSync}
            disabled={syncing || !online}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </button>
        </div>

        {syncMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs">
            {syncMessage}
          </div>
        )}
      </div>

      {/* Quick Tools */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Operations Shortcuts
        </h2>
        <Link
          href="/tech/scan"
          className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex justify-between items-center transition-colors"
        >
          <span>Camera Barcode / Serial Scanner</span>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </Link>
        <Link
          href="/tech/today"
          className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex justify-between items-center transition-colors"
        >
          <span>Today's Field Schedule</span>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </Link>
        <button
          onClick={handleLogout}
          className="w-full p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 flex justify-between items-center transition-colors mt-2"
        >
          <span className="flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out of Device
          </span>
          <span className="text-[10px] text-rose-500">End Session</span>
        </button>
      </div>
    </div>
  );
}
