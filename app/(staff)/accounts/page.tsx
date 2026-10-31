import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { 
  CreditCard, FileText, Receipt, Users, 
  ArrowUpRight, TrendingUp, AlertTriangle, Plus, ShieldCheck 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { KpiTile } from '@/components/KpiTile';
import { formatDateIST } from '@/lib/dates';
import AccountsClient from './AccountsClient';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const [payments, invoices, expenses, orders, technicians] = await Promise.all([
    prisma.payment.findMany({
      include: {
        order: { include: { customer: true } },
        recorder: { select: { name: true } },
      },
      orderBy: { received_on: 'desc' },
      take: 20,
    }),
    prisma.invoice.findMany({
      include: {
        customer: true,
        order: true,
        ticket: true,
      },
      orderBy: { issue_date: 'desc' },
      take: 20,
    }),
    prisma.expense.findMany({
      include: {
        order: true,
        recorder: { select: { name: true } },
      },
      orderBy: { incurred_on: 'desc' },
      take: 20,
    }),
    prisma.order.findMany({
      where: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
      include: { customer: true },
    }),
    prisma.technician.findMany({
      include: {
        user: { select: { name: true } },
        time_logs: true,
      },
    }),
  ]);

  // Aggregate metrics
  const totalCollectionsPaise = payments.reduce((acc, p) => acc + p.amount_paise, 0n);
  const totalExpensesPaise = expenses.reduce((acc, e) => acc + e.amount_paise, 0n);
  const totalReceivablesPaise = orders.reduce((acc, o) => acc + (o.total_paise - o.paid_paise), 0n);
  const totalInvoicedPaise = invoices.reduce((acc, inv) => acc + inv.total_paise, 0n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-blue-600" />
            <span>Accounts, Collections & Expenses</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Collections ledger, sales & service invoice generation, project expenses, technician pay, and subsidy tracking.
          </p>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Total Collections"
          value={<MoneyText paise={totalCollectionsPaise} className="text-emerald-700" />}
          changePercent={14.2}
          changeLabel="vs last month"
        />
        <KpiTile
          label="Receivables Due"
          value={<MoneyText paise={totalReceivablesPaise} className="text-amber-800" />}
          helpText={`${orders.length} active orders pending settlement`}
        />
        <KpiTile
          label="Project Expenses"
          value={<MoneyText paise={totalExpensesPaise} className="text-slate-900" />}
          helpText="Materials, transport & permits"
        />
        <KpiTile
          label="Invoices Issued"
          value={<MoneyText paise={totalInvoicedPaise} className="text-blue-700" />}
          helpText={`${invoices.length} issued sales & service invoices`}
        />
      </div>

      {/* Accounts Client Tabs */}
      <AccountsClient
        payments={payments as any}
        invoices={invoices as any}
        expenses={expenses as any}
        orders={orders as any}
        technicians={technicians as any}
      />
    </div>
  );
}
