'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sun,
  LayoutDashboard,
  Users,
  FileText,
  ShoppingCart,
  Calendar,
  Package,
  Wrench,
  ShieldCheck,
  BarChart3,
  Settings,
  LogOut,
  User,
  CreditCard,
} from 'lucide-react';
import { isRouteAllowedForRole, Role } from '@/lib/rbac';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads (CRM)', icon: Users },
  { href: '/quotes', label: 'Quotes & BOM', icon: FileText },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/inventory', label: 'Inventory & PO', icon: Package },
  { href: '/dispatch', label: 'Dispatch Queue', icon: Wrench },
  { href: '/service', label: 'Service Desk & Warranty', icon: ShieldCheck },
  { href: '/analytics', label: 'Analytics & Profit', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function StaffSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: Role;
    roleTitle?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/login');
    router.refresh();
  }

  // Filter items based on current role permissions
  const role = user?.role || 'DIRECTOR';
  const visibleNavItems = ALL_NAV_ITEMS.filter((item) =>
    isRouteAllowedForRole(role, item.href)
  );

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 shadow-lg">
      <div>
        {/* Brand */}
        <Link href="/dashboard" className="h-16 flex items-center px-6 gap-3 border-b border-slate-800 hover:bg-slate-800/40 transition">
          <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-md">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-base tracking-wide text-white">SunPower</span>
            <span className="text-xs block text-amber-400 font-medium">Ops & Lifecycle</span>
          </div>
        </Link>

        {/* Nav Items */}
        <nav className="p-3 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Card & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-sm font-medium text-white truncate">
              {loading ? 'Loading...' : user?.name || 'Rajesh Shah'}
            </p>
            <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold tracking-wider rounded bg-amber-500/20 text-amber-300 uppercase">
              {user?.role || 'DIRECTOR'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out of SolarOS"
            className="text-slate-400 hover:text-rose-400 p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
