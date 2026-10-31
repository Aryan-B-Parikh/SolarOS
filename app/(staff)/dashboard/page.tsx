import React from 'react';
import { prisma } from '@/lib/db';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [
    orders,
    payments,
    expenses,
    leads,
    tickets,
    lowStockLevels,
    expiringWarranties,
  ] = await Promise.all([
    // Orders with customer and lines for profitability
    prisma.order.findMany({
      include: {
        customer: true,
        expenses: true,
        installation: {
          include: { time_logs: true },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
    // Payments
    prisma.payment.findMany({
      orderBy: { received_on: 'desc' },
    }),
    // Expenses
    prisma.expense.findMany({
      orderBy: { incurred_on: 'desc' },
    }),
    // Leads by status
    prisma.lead.findMany({
      include: { customer: true },
      orderBy: { created_at: 'desc' },
    }),
    // Open tickets
    prisma.serviceTicket.findMany({
      where: { status: { notIn: ['CLOSED'] } },
      include: { customer: true },
      orderBy: { created_at: 'desc' },
    }),
    // Low stock items
    prisma.stockLevel.findMany({
      where: {
        product: { is_active: true },
      },
      include: { product: true, location: true },
    }),
    // Expiring warranties in next 60 days
    prisma.warranty.findMany({
      where: {
        status: 'ACTIVE',
        end_date: {
          lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          gte: new Date(),
        },
      },
      include: { customer: true, product: true },
    }),
  ]);

  return (
    <DashboardClient
      orders={orders as any}
      payments={payments as any}
      expenses={expenses as any}
      leads={leads as any}
      tickets={tickets as any}
      stockLevels={lowStockLevels as any}
      expiringWarranties={expiringWarranties as any}
    />
  );
}
