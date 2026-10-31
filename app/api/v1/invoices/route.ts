import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { z } from 'zod';
import prisma from '@/lib/db';
import { createServiceInvoice, createSalesInvoiceForOrder } from '@/services/invoices';
import { InvoiceStatus, InvoiceType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'ACCOUNTS', 'SALES', 'SUPPORT'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const customerId = url.searchParams.get('customerId') || undefined;
    const orderId = url.searchParams.get('orderId') || undefined;
    const status = url.searchParams.get('status') as InvoiceStatus | undefined;
    const type = url.searchParams.get('type') as InvoiceType | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

    const where: any = {};
    if (customerId) where.customer_id = customerId;
    if (orderId) where.order_id = orderId;
    if (status) where.status = status;
    if (type) where.type = type;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          order: { select: { id: true, order_number: true } },
          lines: true,
        },
        orderBy: { issue_date: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        customerId: inv.customer_id,
        customerName: inv.customer?.name,
        orderNumber: inv.order?.order_number,
        type: inv.type,
        status: inv.status,
        issueDate: inv.issue_date.toISOString(),
        dueDate: inv.due_date.toISOString(),
        subtotalPaise: inv.subtotal_paise.toString(),
        taxPaise: inv.tax_paise.toString(),
        totalPaise: inv.total_paise.toString(),
        linesCount: inv.lines.length,
      })),
      total,
      limit,
      offset,
    });
  }
);

const IssueInvoiceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('SERVICE'),
    ticketId: z.string().uuid().optional(),
    customerId: z.string().uuid(),
    lines: z.array(
      z.object({
        productId: z.string().uuid().optional(),
        description: z.string().min(1),
        qty: z.number().positive(),
        unitPricePaise: z.string().or(z.number()).transform((v) => BigInt(v)),
        taxRateBp: z.number().int().nonnegative().default(1800),
      })
    ).min(1),
  }),
  z.object({
    kind: z.literal('SALES_ORDER'),
    orderId: z.string().uuid(),
  }),
]);

export const POST = createApiHandler(
  {
    bodySchema: IssueInvoiceSchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ body, user }) => {
    if (body.kind === 'SALES_ORDER') {
      const order = await prisma.order.findUnique({
        where: { id: body.orderId },
        include: { lines: true },
      });
      if (!order) {
        return NextResponse.json({ error: { message: 'Order not found' } }, { status: 404 });
      }
      const result = await createSalesInvoiceForOrder(
        {
          id: order.id,
          customer_id: order.customer_id,
          order_number: order.order_number,
          subtotal_paise: order.subtotal_paise,
          tax_paise: order.tax_paise,
          total_paise: order.total_paise,
          lines: order.lines.map((l) => ({
            product_id: l.product_id,
            description: l.description,
            qty: l.qty,
            unit_price_paise: l.unit_price_paise,
            tax_rate_bp: l.tax_rate_bp,
          })),
        },
        user?.id
      );
      return NextResponse.json({
        success: true,
        invoiceNumber: result.invoice.invoice_number,
        invoiceId: result.invoice.id,
        created: result.created,
      });
    } else {
      const invoice = await createServiceInvoice(
        {
          ticketId: body.ticketId,
          customerId: body.customerId,
          lines: body.lines,
        },
        user?.id
      );
      return NextResponse.json({
        success: true,
        invoiceNumber: invoice.invoice_number,
        invoiceId: invoice.id,
        created: true,
      });
    }
  }
);

