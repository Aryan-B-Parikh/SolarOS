import React from 'react';
import { prisma } from '@/lib/db';
import { 
  Settings as SettingsIcon, Building, ShieldCheck, 
  Users, Package, Percent, Sliders, Check 
} from 'lucide-react';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [settings, products, templates, users] = await Promise.all([
    prisma.setting.findMany(),
    prisma.product.findMany({
      orderBy: { category: 'asc' },
    }),
    prisma.systemTemplate.findMany({
      include: {
        bom_lines: { include: { product: true } },
      },
      orderBy: { capacity_kw: 'asc' },
    }),
    prisma.user.findMany({
      orderBy: { role: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <SettingsIcon className="w-7 h-7 text-blue-600" />
            <span>System Settings & Configuration (Screen S21)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Company branding, target margin, advance payment threshold, system templates, and user access roles.
          </p>
        </div>
      </div>

      <SettingsClient
        initialSettings={settings as any}
        products={products as any}
        templates={templates as any}
        users={users as any}
      />
    </div>
  );
}

