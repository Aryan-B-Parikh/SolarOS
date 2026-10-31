/**
 * SunPower Ops - Global Search & Customer Service View Service (Spec 6.3 Phase 7, TRD 2.4, Rule C9)
 * Blazing fast sub-300ms multi-entity search across Phone, Trigram Customer Name, Equipment Serial Numbers,
 * and Document Numbers (Orders, Dispatches, Tickets, Invoices, Purchase Orders).
 */

import { prisma } from '../lib/db.ts';
import { evaluateWarrantyEligibility, type WarrantyVerdict } from '../domain/warranty.ts';

export interface CustomerSearchResult {
  id: string;
  customerNumber: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  address: string;
  installationCount: number;
  activeWarrantiesCount: number;
}

export interface UnitSearchResult {
  id: string;
  serialNumber: string;
  qrCode: string;
  productName: string;
  brand: string;
  model: string;
  category: string;
  status: string;
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  installationId: string | null;
  warrantyVerdict: WarrantyVerdict;
  warrantyEndDate?: string | null;
  remainingDays: number;
  isCovered: boolean;
}

export interface DocumentSearchResult {
  type: 'ORDER' | 'DISPATCH' | 'TICKET' | 'INVOICE' | 'PURCHASE_ORDER' | 'QUOTE';
  id: string;
  number: string;
  title: string;
  status: string;
  date?: string | null;
  customerId?: string | null;
  customerName?: string | null;
}

export interface GlobalSearchResponse {
  query: string;
  responseTimeMs: number;
  totalMatches: number;
  customers: CustomerSearchResult[];
  units: UnitSearchResult[];
  documents: DocumentSearchResult[];
}

export interface CustomerWarrantyBarView {
  unitId: string;
  serialNumber: string;
  qrCode: string;
  productName: string;
  category: string;
  brand: string;
  model: string;
  installationId: string;
  warrantyId: string;
  coverage: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  percentElapsed: number;
  status: string;
  verdict: WarrantyVerdict;
  isCovered: boolean;
}

export interface CustomerServiceViewResponse {
  customer: {
    id: string;
    customerNumber: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  installations: Array<{
    id: string;
    orderNumber: string;
    status: string;
    capacityKw: number;
    scheduledOn: string | null;
    signedName: string | null;
  }>;
  equipmentWarranties: CustomerWarrantyBarView[];
  tickets: Array<{
    id: string;
    ticketNumber: string;
    category: string;
    priority: string;
    status: string;
    faultCode: string | null;
    description: string;
    warrantyVerdict: string;
    billingMode: string;
    createdAt: string;
    resolvedAt: string | null;
    closedAt: string | null;
  }>;
}

/**
 * Executes a fast (< 300 ms) unified search across all business entities.
 */
export async function globalSearch(rawQuery: string): Promise<GlobalSearchResponse> {
  const startTime = Date.now();
  const query = rawQuery.trim();

  if (!query) {
    return {
      query: '',
      responseTimeMs: 0,
      totalMatches: 0,
      customers: [],
      units: [],
      documents: [],
    };
  }

  // Normalize phone digits for fuzzy match if applicable
  const digitsOnly = query.replace(/[^0-9]/g, '');

  const customerConditions: any[] = [
    { name: { contains: query, mode: 'insensitive' } },
    { customer_number: { contains: query, mode: 'insensitive' } },
    { phone: { contains: query, mode: 'insensitive' } },
  ];

  if (digitsOnly.length >= 4) {
    customerConditions.push({ phone: { contains: digitsOnly } });
  }

  // Parallel lookup across DB entities
  const [customers, units, orders, dispatches, tickets, invoices, quotes, pos] = await Promise.all([
    // 1. Customers
    prisma.customer.findMany({
      where: { OR: customerConditions },
      include: {
        orders: { include: { installation: { select: { id: true } } } },
        warranties: { where: { status: 'ACTIVE' }, select: { id: true } },
      },
      take: 10,
    }),

    // 2. Serialized Inventory Units
    prisma.inventoryUnit.findMany({
      where: {
        OR: [
          { serial_number: { contains: query, mode: 'insensitive' } },
          { qr_code: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        product: true,
        customer: { select: { id: true, name: true, phone: true } },
        warranties: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      take: 10,
    }),

    // 3. Orders
    prisma.order.findMany({
      where: { order_number: { contains: query, mode: 'insensitive' } },
      include: { customer: { select: { id: true, name: true } } },
      take: 5,
    }),

    // 4. Dispatches
    prisma.dispatch.findMany({
      where: { dispatch_number: { contains: query, mode: 'insensitive' } },
      include: { order: { include: { customer: { select: { id: true, name: true } } } } },
      take: 5,
    }),

    // 5. Service Tickets
    prisma.serviceTicket.findMany({
      where: {
        OR: [
          { ticket_number: { contains: query, mode: 'insensitive' } },
          { fault_code: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { customer: { select: { id: true, name: true } } },
      take: 5,
    }),

    // 6. Invoices
    prisma.invoice.findMany({
      where: { invoice_number: { contains: query, mode: 'insensitive' } },
      include: { customer: { select: { id: true, name: true } } },
      take: 5,
    }),

    // 7. Quotes
    prisma.quote.findMany({
      where: { quote_number: { contains: query, mode: 'insensitive' } },
      include: { customer: { select: { id: true, name: true } } },
      take: 5,
    }),

    // 8. Purchase Orders
    prisma.purchaseOrder.findMany({
      where: { po_number: { contains: query, mode: 'insensitive' } },
      include: { supplier: { select: { id: true, name: true } } },
      take: 5,
    }),
  ]);

  // Format Customer results
  const formattedCustomers: CustomerSearchResult[] = customers.map((c) => ({
    id: c.id,
    customerNumber: c.customer_number,
    name: c.name,
    phone: c.phone,
    email: c.email,
    city: c.city,
    address: c.address,
    installationCount: c.orders.filter((o) => o.installation !== null).length,
    activeWarrantiesCount: c.warranties.length,
  }));

  // Format Unit results with warranty evaluation
  const today = new Date();
  const formattedUnits: UnitSearchResult[] = units.map((u) => {
    const latestWarranty = u.warranties[0];
    let verdict: WarrantyVerdict = 'UNKNOWN_UNIT';
    let remainingDays = 0;
    let isCovered = false;
    let endDateStr: string | null = null;

    if (latestWarranty) {
      endDateStr = latestWarranty.end_date.toISOString().split('T')[0];
      const startDateStr = latestWarranty.start_date.toISOString().split('T')[0];
      const eligibility = evaluateWarrantyEligibility({
        testDate: today,
        startDate: startDateStr,
        endDate: endDateStr,
        status: latestWarranty.status as any,
      });
      verdict = eligibility.verdict;
      remainingDays = eligibility.remainingDays;
      isCovered = eligibility.isCovered;
    }

    return {
      id: u.id,
      serialNumber: u.serial_number,
      qrCode: u.qr_code,
      productName: u.product.name,
      brand: u.product.brand,
      model: u.product.model,
      category: u.product.category,
      status: u.status,
      customerId: u.customer_id,
      customerName: u.customer?.name,
      customerPhone: u.customer?.phone,
      installationId: u.installation_id,
      warrantyVerdict: verdict,
      warrantyEndDate: endDateStr,
      remainingDays,
      isCovered,
    };
  });

  // Format Document results
  const formattedDocs: DocumentSearchResult[] = [
    ...orders.map((o) => ({
      type: 'ORDER' as const,
      id: o.id,
      number: o.order_number,
      title: `Order ${o.order_number} (${o.capacity_kw} kW)`,
      status: o.status,
      date: o.created_at.toISOString().split('T')[0],
      customerId: o.customer_id,
      customerName: o.customer.name,
    })),
    ...dispatches.map((d) => ({
      type: 'DISPATCH' as const,
      id: d.id,
      number: d.dispatch_number,
      title: `Dispatch ${d.dispatch_number} for Order ${d.order.order_number}`,
      status: d.status,
      date: d.created_at.toISOString().split('T')[0],
      customerId: d.order.customer_id,
      customerName: d.order.customer.name,
    })),
    ...tickets.map((t) => ({
      type: 'TICKET' as const,
      id: t.id,
      number: t.ticket_number,
      title: `Ticket ${t.ticket_number} - ${t.category}`,
      status: t.status,
      date: t.created_at.toISOString().split('T')[0],
      customerId: t.customer_id,
      customerName: t.customer.name,
    })),
    ...invoices.map((i) => ({
      type: 'INVOICE' as const,
      id: i.id,
      number: i.invoice_number,
      title: `Invoice ${i.invoice_number} (${i.type})`,
      status: i.status,
      date: i.issue_date.toISOString().split('T')[0],
      customerId: i.customer_id,
      customerName: i.customer.name,
    })),
    ...quotes.map((q) => ({
      type: 'QUOTE' as const,
      id: q.id,
      number: q.quote_number,
      title: `Quote ${q.quote_number} (${q.capacity_kw} kW)`,
      status: q.status,
      date: q.created_at.toISOString().split('T')[0],
      customerId: q.customer_id,
      customerName: q.customer.name,
    })),
    ...pos.map((p) => ({
      type: 'PURCHASE_ORDER' as const,
      id: p.id,
      number: p.po_number,
      title: `PO ${p.po_number} - ${p.supplier.name}`,
      status: p.status,
      date: p.ordered_on ? p.ordered_on.toISOString().split('T')[0] : null,
    })),
  ];

  const responseTimeMs = Date.now() - startTime;

  return {
    query,
    responseTimeMs,
    totalMatches: formattedCustomers.length + formattedUnits.length + formattedDocs.length,
    customers: formattedCustomers,
    units: formattedUnits,
    documents: formattedDocs,
  };
}

/**
 * Returns complete customer context with installed equipment and warranty bars (Screen S17).
 */
export async function getCustomerServiceView(customerId: string): Promise<CustomerServiceViewResponse> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        include: { installation: true },
        orderBy: { created_at: 'desc' },
      },
      warranties: {
        include: {
          product: true,
          unit: true,
        },
        orderBy: { created_at: 'desc' },
      },
      service_tickets: {
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  const today = new Date();

  // Calculate equipment warranty bars
  const equipmentWarranties: CustomerWarrantyBarView[] = customer.warranties.map((w) => {
    const startDate = w.start_date;
    const endDate = w.end_date;

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const todayMs = today.getTime();

    const totalDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 3600 * 24)));
    const elapsedDays = Math.max(0, Math.round((todayMs - startMs) / (1000 * 3600 * 24)));
    const remainingDays = Math.max(0, Math.round((endMs - todayMs) / (1000 * 3600 * 24)));
    const percentElapsed = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const eligibility = evaluateWarrantyEligibility({
      testDate: today,
      startDate: startDateStr,
      endDate: endDateStr,
      status: w.status as any,
    });

    return {
      unitId: w.unit_id || '',
      serialNumber: w.unit?.serial_number || 'N/A',
      qrCode: w.unit?.qr_code || 'N/A',
      productName: w.product?.name || 'Equipment',
      category: w.product?.category || 'EQUIPMENT',
      brand: w.product?.brand || 'SunPower',
      model: w.product?.model || 'Generic',
      installationId: w.installation_id,
      warrantyId: w.id,
      coverage: w.coverage,
      startDate: startDateStr,
      endDate: endDateStr,
      totalDays,
      elapsedDays,
      remainingDays,
      percentElapsed,
      status: w.status,
      verdict: eligibility.verdict,
      isCovered: eligibility.isCovered,
    };
  });

  const installations = customer.orders
    .filter((o) => o.installation !== null)
    .map((o) => {
      const inst = o.installation!;
      return {
        id: inst.id,
        orderNumber: o.order_number,
        status: inst.status,
        capacityKw: Number(o.capacity_kw || 0),
        scheduledOn: inst.scheduled_on ? inst.scheduled_on.toISOString().split('T')[0] : null,
        signedName: inst.signed_name,
      };
    });

  return {
    customer: {
      id: customer.id,
      customerNumber: customer.customer_number,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
    },
    installations,
    equipmentWarranties,
    tickets: customer.service_tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticket_number,
      category: t.category,
      priority: t.priority,
      status: t.status,
      faultCode: t.fault_code,
      description: t.description,
      warrantyVerdict: t.warranty_verdict,
      billingMode: t.billing_mode,
      createdAt: t.created_at.toISOString(),
      resolvedAt: t.resolved_at ? t.resolved_at.toISOString() : null,
      closedAt: t.closed_at ? t.closed_at.toISOString() : null,
    })),
  };
}
