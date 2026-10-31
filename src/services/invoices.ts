import { prisma } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import { recordAudit } from '../lib/audit.ts';
import { getNextSequence } from '../lib/sequences.ts';
import { InvoiceType, InvoiceStatus } from '@prisma/client';

export interface CreateServiceInvoiceDto {
  ticketId: string;
  customerId: string;
  lines: {
    productId?: string;
    description: string;
    qty: number;
    unitPricePaise: bigint;
    taxRateBp: number;
  }[];
}

/**
 * Reads company branding from the Setting table (FR-8.7 / FR-10.3).
 * Supports both the flat keys (company_name, company_phone, ...) and the
 * nested `company_branding` object written by the seed.
 */
export async function getCompanyBranding(): Promise<{
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyPhone: string;
  companyEmail: string;
  companyBank: string;
}> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'company_name',
          'company_address',
          'company_gstin',
          'company_bank_details',
          'company_phone',
          'company_email',
          'company_branding',
        ],
      },
    },
  });

  const read = (flatKey: string, nestedKey: string, fallback: string): string => {
    const flat = settings.find((s) => s.key === flatKey);
    const flatValue: unknown = (flat?.value as any)?.value ?? flat?.value;
    if (typeof flatValue === 'string' && flatValue.length) return flatValue;
    const nested = settings.find((s) => s.key === 'company_branding');
    const nestedRaw: any = nested?.value;
    const nestedValue: unknown = nestedRaw?.value?.[nestedKey] ?? nestedRaw?.[nestedKey];
    if (typeof nestedValue === 'string' && nestedValue.length) return nestedValue;
    return fallback;
  };

  return {
    companyName: read('company_name', 'companyName', 'SunPower Solar Systems Pvt Ltd'),
    companyAddress: read('company_address', 'address', '401 SunPower Tower, SG Highway, Ahmedabad, Gujarat 380054'),
    companyGstin: read('company_gstin', 'gstin', ''),
    companyPhone: read('company_phone', 'phone', ''),
    companyEmail: read('company_email', 'email', ''),
    companyBank: read('company_bank_details', 'bankDetails', ''),
  };
}

/**
 * Creates the SALES invoice for a confirmed sales order (FR-8.7 / C11).
 * Mirrors createServiceInvoice: INV-YYYY-#### numbering via the sequence
 * service, lines copied from the order lines, ISSUED on creation.
 *
 * Idempotent: an order already carrying a SALES invoice is left untouched
 * (the existing invoice is returned), so payment-triggered re-confirmation
 * or a replayed confirm request never produces duplicates.
 */
export async function createSalesInvoiceForOrder(
  order: {
    id: string;
    customer_id: string;
    order_number: string;
    subtotal_paise: bigint;
    tax_paise: bigint;
    total_paise: bigint;
    lines: Array<{
      product_id: string;
      description: string;
      qty: any; // Prisma Decimal
      unit_price_paise: bigint;
      tax_rate_bp: number;
    }>;
  },
  actorId?: string,
  tx?: any
): Promise<{ invoice: any; created: boolean }> {
  const db = tx || prisma;

  const existing = await db.invoice.findFirst({
    where: { order_id: order.id, type: InvoiceType.SALES },
  });
  if (existing) {
    return { invoice: existing, created: false };
  }

  const invoiceNumber = await getNextSequence('invoice', undefined, db);
  const today = new Date();
  const dueDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);

  const lineItems = order.lines.map((l) => {
    const qty = Number(l.qty);
    const lineTotal = BigInt(Math.round(qty * Number(l.unit_price_paise)));
    return {
      product_id: l.product_id,
      description: l.description,
      qty: l.qty,
      unit_price_paise: l.unit_price_paise,
      tax_rate_bp: l.tax_rate_bp,
      line_total_paise: lineTotal,
    };
  });

  const invoice = await db.invoice.create({
    data: {
      invoice_number: invoiceNumber,
      customer_id: order.customer_id,
      order_id: order.id,
      type: InvoiceType.SALES,
      issue_date: today,
      due_date: dueDate,
      subtotal_paise: order.subtotal_paise,
      tax_paise: order.tax_paise,
      total_paise: order.total_paise,
      status: InvoiceStatus.ISSUED,
      lines: {
        create: lineItems,
      },
    },
    include: { lines: true },
  });

  await recordAudit(
    {
      actorType: actorId ? 'USER' : 'SYSTEM',
      actorId,
      entityType: 'INVOICE',
      entityId: invoice.id,
      action: 'SALES_INVOICE_GENERATED',
      after: {
        invoiceNumber,
        orderId: order.id,
        orderNumber: order.order_number,
        totalPaise: order.total_paise.toString(),
      },
    },
    db
  );

  return { invoice, created: true };
}

export async function createServiceInvoice(data: CreateServiceInvoiceDto, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await getNextSequence('invoice', undefined, tx);
    const today = new Date();
    const dueDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);

    let subtotalPaise = 0n;
    let totalTaxPaise = 0n;

    const lineItems = data.lines.map((l) => {
      const lineTotal = BigInt(Math.round(l.qty * Number(l.unitPricePaise)));
      const lineTax = BigInt(Math.round((Number(lineTotal) * l.taxRateBp) / 10000));
      subtotalPaise += lineTotal;
      totalTaxPaise += lineTax;

      return {
        product_id: l.productId || null,
        description: l.description,
        qty: l.qty,
        unit_price_paise: l.unitPricePaise,
        tax_rate_bp: l.taxRateBp,
        line_total_paise: lineTotal,
      };
    });

    const totalPaise = subtotalPaise + totalTaxPaise;

    const invoice = await tx.invoice.create({
      data: {
        invoice_number: invoiceNumber,
        customer_id: data.customerId,
        ticket_id: data.ticketId,
        type: InvoiceType.SERVICE,
        issue_date: today,
        due_date: dueDate,
        subtotal_paise: subtotalPaise,
        tax_paise: totalTaxPaise,
        total_paise: totalPaise,
        status: InvoiceStatus.ISSUED,
        lines: {
          create: lineItems,
        },
      },
      include: {
        lines: true,
      },
    });

    await recordAudit(
      {
        actorType: 'SYSTEM',
        actorId,
        entityType: 'INVOICE',
        entityId: invoice.id,
        action: 'SERVICE_INVOICE_GENERATED',
        after: {
          invoiceNumber,
          ticketId: data.ticketId,
          totalPaise: totalPaise.toString(),
        },
      },
      tx
    );

    return invoice;
  });
}

