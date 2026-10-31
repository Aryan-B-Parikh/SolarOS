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

