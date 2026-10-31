import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { 
  ShieldCheck, Search, Wrench, AlertTriangle, 
  Phone, User, ArrowRight, Clock, Plus 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { WarrantyBar } from '@/components/WarrantyBar';
import { formatDateIST } from '@/lib/dates';
import ServiceDeskClient from './ServiceDeskClient';

export const dynamic = 'force-dynamic';

export default async function ServiceDeskPage() {
  const [tickets, warranties] = await Promise.all([
    prisma.serviceTicket.findMany({
      include: {
        customer: true,
        warranty: true,
        assignee: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    }),
    prisma.warranty.findMany({
      where: { status: 'ACTIVE' },
      include: { customer: true, product: true, unit: true },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
            <span>Service Desk & Warranty Verification (Screen S17)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Serial lookup in seconds, automated warranty verdict, breakdown ticketing, and billing verification.
          </p>
        </div>
      </div>

      <ServiceDeskClient
        initialTickets={tickets as any}
        warranties={warranties as any}
      />
    </div>
  );
}

