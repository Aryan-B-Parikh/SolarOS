import React from 'react';
import { prisma } from '@/lib/db';
import {
  ShieldCheck,
} from 'lucide-react';
import ServiceDeskClient from './ServiceDeskClient';
import { getFaultCodeCatalogue } from '@/services/tickets';

export const dynamic = 'force-dynamic';

export default async function ServiceDeskPage() {
  const [tickets, catalogue] = await Promise.all([
    prisma.serviceTicket.findMany({
      include: {
        customer: true,
        unit: { include: { product: true } },
        warranty: true,
        assignee: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    }),
    getFaultCodeCatalogue(),
  ]);

  // Serialize for the client component (Dates become ISO strings over the RSC boundary)
  const initialTickets = tickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    customerId: t.customer_id,
    customerName: t.customer.name,
    customerPhone: t.customer.phone,
    category: t.category,
    faultCode: t.fault_code,
    description: t.description,
    priority: t.priority as string,
    status: t.status as string,
    warrantyVerdict: t.warranty_verdict as string,
    billingMode: t.billing_mode as string,
    slaDueAt: t.sla_due_at.toISOString(),
    createdAt: t.created_at.toISOString(),
    assigneeName: t.assignee?.name || null,
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
            <span>Service Desk &amp; Warranty Verification (Screen S17)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Serial lookup in seconds, automated warranty verdict, breakdown ticketing, and billing verification.
          </p>
        </div>
      </div>

      <ServiceDeskClient initialTickets={initialTickets} faultCatalogue={catalogue} />
    </div>
  );
}
