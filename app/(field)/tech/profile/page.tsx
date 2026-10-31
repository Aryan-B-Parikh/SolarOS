'use client';

/**
 * SunPower Ops - Tech Profile / Offline Sync Console
 * Shows the real signed-in technician (session via /api/v1/auth/me) and the
 * state of the IndexedDB offline queue (FR-6.7 / PRD 3.1).
 */
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  User,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  Phone,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { flushOfflineQueue, getOfflineQueueCount, onOnline, onOffline } from '@/lib/offline-queue';

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

function formatRole(role: string): string {
  if (!role) return '-';
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function TechProfilePage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [meLoaded, setMeLoaded] = useState<boolean>(false);
  const [online, setOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    getOfflineQueueCount().then(setQueueCount).catch(() => {});

    fetch('/api/v1/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null))
      .finally(() => setMeLoaded(true));

    const on = onOnline(() => {
      setOnline(true);
      getOfflineQueueCount().then(setQueueCount).catch(() => {});
    });
    const off = onOffline(() => setOnline(false));

    return () => {
      on();
      off();
    };
  }, []);

  const handleManualSync = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncMessage('Cannot sync while offline. Please connect to Wi-Fi or cellular network.');
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await flushOfflineQueue();
      setQueueCount(result.remaining);
      setSyncMessage(
        `Sync completed: ${result.synced} item(s) uploaded (${result.uploads} photo/file, ${result.apiCalls} action), ${result.remaining} remaining.`
      );
    } catch (err: any) {
      setSyncMessage(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-24 pt-2 px-3">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
          <User className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {meLoaded ? (me?.name || 'Signed-in Staff') : 'Loading…'}
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            {me ? `ID: ${me.id.slice(0, 8).toUpperCase()}` : '-'}
          </p>
          <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800">
            {me ? formatRole(me.role) : 'FIELD APP'}
          </span>
          {me?.email && (
            <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-slate-500">
              <Mail className="w-3.5 h-3.5" />
              <span>{me.email}</span>
            </div>
          )}
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
          <span>Today&apos;s Field Schedule</span>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </Link>
        <Link
          href="/tech/jobs"
          className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex justify-between items-center transition-colors"
        >
          <span>My Installation Jobs</span>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </Link>
      </div>
    </div>
  );
}
