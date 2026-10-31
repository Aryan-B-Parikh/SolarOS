/**
 * SunPower Ops - Field PWA Layout
 * Phase 0 - Foundations
 * Member 3: Operations Frontend
 * Spec: TRD 2.1, 2.12 (field), PRD 3.1 (Field ergonomics), S14, S15
 *
 * Rules:
 *  - Touch targets minimum 48 px (PRD 1.7)
 *  - Primary action in bottom bar (PRD 3.1)
 *  - 16 px minimum text (PRD 1.7)
 *  - High-contrast light theme for sunlight readability
 *  - Installable PWA: register service worker
 */
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const metadata = {
  title: 'SunPower Field',
  description: 'SunPower Ops field technician application',
  manifest: '/manifest.json',
  themeColor: '#f97316',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SunPower Field',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

const NAV_ITEMS = [
  { href: '/tech/today', label: 'Today', icon: CalendarIcon },
  { href: '/tech/scan', label: 'Scan', icon: QrCodeIcon },
  { href: '/tech/jobs', label: 'Jobs', icon: ClipboardIcon },
  { href: '/tech/profile', label: 'Profile', icon: UserIcon },
] as const;

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function QrCodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M14 14h4v4h-4z" strokeLinejoin="round" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Register service worker on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.info('[SW] Registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    }
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '16px',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
      }}
    >
      {/* ── Main content area ── */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: '80px', // clear of bottom nav
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </main>

      {/* ── Bottom navigation bar ── */}
      <nav
        aria-label="Field app navigation"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
          zIndex: 50,
        }}
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                minWidth: '48px',
                minHeight: '48px',
                padding: '4px 12px',
                borderRadius: '12px',
                color: isActive ? '#f97316' : '#64748b',
                textDecoration: 'none',
                transition: 'color 0.15s ease, background-color 0.15s ease',
                backgroundColor: isActive ? '#fff7ed' : 'transparent',
              }}
            >
              <Icon />
              <span style={{ fontSize: '11px', fontWeight: isActive ? 600 : 400 }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
