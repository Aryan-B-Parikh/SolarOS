import React from 'react';
import Link from 'next/link';
import { Sun, Search, LayoutDashboard, Users, FileText, ShoppingCart, Calendar, Package, Wrench, ShieldCheck, BarChart3, Settings, LogOut } from 'lucide-react';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
              <span className="text-xs block text-amber-400 font-medium">Ops & Lifecycle</span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-1">
            <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              Dashboard
            </Link>
            <Link href="/leads" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <Users className="w-4 h-4 text-slate-400" />
              Leads (CRM)
            </Link>
            <Link href="/quotes" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <FileText className="w-4 h-4 text-slate-400" />
              Quotes & BOM
            </Link>
            <Link href="/orders" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <ShoppingCart className="w-4 h-4 text-slate-400" />
              Orders
            </Link>
            <Link href="/schedule" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <Calendar className="w-4 h-4 text-slate-400" />
              Schedule
            </Link>
            <Link href="/inventory" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <Package className="w-4 h-4 text-slate-400" />
              Inventory & PO
            </Link>
            <Link href="/dispatch" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <Wrench className="w-4 h-4 text-slate-400" />
              Dispatch Queue
            </Link>
            <Link href="/service" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              Service Desk & Warranty
            </Link>
            <Link href="/analytics" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              Analytics & Profit
            </Link>
            <Link href="/settings" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 text-slate-200">
              <Settings className="w-4 h-4 text-slate-400" />
              Settings
            </Link>
          </nav>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Rajesh Shah</p>
              <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300">
                DIRECTOR
              </span>
            </div>
            <button className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800">
              <LogOut className="w-4 h-4" />
            </button>
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
            <span>IST (UTC+5:30)</span>
            <div className="h-4 w-px bg-slate-200" />
            <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded">System Online (99.5%)</span>
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

