import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Sun, Search, LayoutDashboard, Users, FileText, ShoppingCart, Calendar, Package,
  Wrench, ShieldCheck, BarChart3, Settings, UserCog, Phone,
} from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[]; // undefined = all staff
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['DIRECTOR', 'ACCOUNTS'] },
  { href: '/leads', label: 'Leads (CRM)', icon: Users, roles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'] },
  { href: '/quotes', label: 'Quotes & BOM', icon: FileText, roles: ['DIRECTOR', 'SALES', 'SUPPORT'] },
  { href: '/orders', label: 'Orders', icon: ShoppingCart, roles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS', 'WAREHOUSE'] },
  { href: '/schedule', label: 'Schedule', icon: Calendar, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { href: '/inventory', label: 'Inventory & PO', icon: Package, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { href: '/purchasing', label: 'Purchasing', icon: Package, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { href: '/dispatch', label: 'Dispatch Queue', icon: Wrench, roles: ['DIRECTOR', 'WAREHOUSE', 'TECHNICIAN'] },
  { href: '/service', label: 'Service Desk & Warranty', icon: ShieldCheck, roles: ['DIRECTOR', 'SUPPORT', 'ACCOUNTS'] },
  { href: '/analytics', label: 'Analytics & Profit', icon: BarChart3, roles: ['DIRECTOR', 'ACCOUNTS'] },
  { href: '/admin/users', label: 'Users & Roles', icon: UserCog, roles: ['DIRECTOR'] },
  { href: '/admin/audit', label: 'Audit Log', icon: ShieldCheck, roles: ['DIRECTOR'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['DIRECTOR'] },
];

const COMPANY_CONTACT = process.env.COMPANY_CONTACT_PHONE || '+91 98250 12345';

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  // Session gate (Spec 2.6 / D13): no cookie => straight to login
  if (!user) {
    redirect('/login');
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 shadow-lg">
        <div>
          {/* Brand */}
          <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-md">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-wide text-white">SunPower</span>
              <span className="text-xs block text-amber-400 font-medium">Ops &amp; Lifecycle</span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200"
              >
                <item.icon className="w-4 h-4 text-slate-400" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* User Card - real session identity */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{user.name}</p>
              <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300">
                {user.role}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search phone, serial, customer, order (Ctrl+K)..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
            />
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              Helpline {COMPANY_CONTACT}
            </span>
            <span>IST (UTC+5:30)</span>
            <div className="h-4 w-px bg-slate-200" />
            <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded">System Online</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
