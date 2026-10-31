/**
 * SunPower Ops - Offline Banner Component
 * Phase 1 - Member 3: Operations Frontend
 * Spec: PRD 3.1 (never lose input - offline banner shows when uploads are queued)
 */
'use client';

import { useState, useEffect } from 'react';
import { isOnline, onOnline, onOffline, getPendingUploads, getQueuedApiCalls } from '@/lib/offline-queue';

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setOnline(isOnline());

    const removeOnline = onOnline(() => {
      setOnline(true);
      refreshCount();
    });
    const removeOffline = onOffline(() => setOnline(false));

    refreshCount();
    const interval = setInterval(refreshCount, 10000);

    return () => {
      removeOnline();
      removeOffline();
      clearInterval(interval);
    };
  }, []);

  async function refreshCount() {
    try {
      const uploads = await getPendingUploads();
      const calls = await getQueuedApiCalls();
      setPendingCount(uploads.length + calls.length);
    } catch {
      // IndexedDB might not be available in SSR
    }
  }

  if (online && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontSize: '14px',
        fontWeight: 500,
        color: '#fff',
        backgroundColor: online ? '#f59e0b' : '#ef4444',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        animation: 'slideDown 0.3s ease-out',
      }}
    >
      {!online ? (
        <>
          <span style={{ fontSize: '16px' }}>📡</span>
          <span>You are offline. Changes will sync when connected.</span>
        </>
      ) : (
        <>
          <span
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span>Syncing {pendingCount} pending {pendingCount === 1 ? 'item' : 'items'}...</span>
        </>
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
