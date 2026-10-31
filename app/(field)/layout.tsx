/**
 * SunPower Ops - Field PWA Layout
 * Phase 0 - Foundations
 * Member 3: Operations Frontend
 * Spec: TRD 2.1, 2.12 (field), PRD 3.1 (Field ergonomics), S14, S15
 *
 * This file stays a server component so it can export metadata/viewport.
 * The interactive parts (usePathname, service worker registration, bottom nav)
 * live in ./FieldShell.tsx, which is a client component.
 */
import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import FieldShell from './FieldShell';
import { getSessionUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'SunPower Field',
  description: 'SunPower Ops field technician application',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SunPower Field',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#f97316',
};

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  // Field app requires a signed-in technician (session cookie, D13)
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  return <FieldShell>{children}</FieldShell>;
}
