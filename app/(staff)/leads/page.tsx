import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { 
  Users, Plus, PhoneCall, Globe, MessageSquare, 
  MapPin, Clock, AlertTriangle, ShieldAlert, ArrowRight,
  Filter, CheckCircle2, Search
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { LeadStatus, LeadSource, DuplicateFlagStatus } from '@prisma/client';
import { formatDateIST } from '@/lib/dates';
import LeadBoardClient from './LeadBoardClient';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: { owner?: string; search?: string };
}) {
  const where: any = {};
  if (searchParams?.owner) {
    where.owner_id = searchParams.owner;
  }

  const [leads, salesUsers, technicians] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        customer: true,
        owner: { select: { id: true, name: true } },
        duplicate_flags: { where: { status: DuplicateFlagStatus.OPEN } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.user.findMany({
      where: { role: 'SALES', is_active: true },
      select: { id: true, name: true },
    }),
    // Surveyor options for the Book Survey modal (FR-2.2).
    prisma.technician.findMany({
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-blue-600" />
            <span>Leads (CRM)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage incoming enquiries, qualification checklist, duplicate detection, and survey handoffs.
          </p>
        </div>

        {/* Client-side quick action trigger */}
        <LeadBoardClient
          salesUsers={salesUsers}
          initialLeads={leads as any}
          technicians={technicians as any}
        />
      </div>
    </div>
  );
}

