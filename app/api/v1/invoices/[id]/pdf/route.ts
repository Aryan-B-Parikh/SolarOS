import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import { getCompanyBranding } from '@/services/invoices';
import { formatDateIST } from '@/lib/dates';
import {
  createPdfDocument,
  drawTable,
  drawTotals,
  drawSection,
  inr,
  pdfResponseHeaders,
} from '@/lib/pdf';

export const dynamic = 'force-dynamic';

/**
 * Invoice PDF (FR-8.7 / X-SEC-PDF).
 *
 * Access is granted to:
 *  - authenticated staff (session cookie), or
 *  - a customer holding a valid PORTAL access link via ?portal=<rawToken>
 *    (hashed lookup, status-evaluated; the invoice must belong to that
 *    customer).
 * A bare invoice UUID grants nothing.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const invoiceId = parts[parts.indexOf('invoices') + 1];
  const portalToken = url.searchParams.get('portal') || '';

  const user = await getSessionUser();

  let invoice: any;

  if (portalToken) {
    // Customer path: validate the portal link then bind it to the invoice's customer
    const tokenHash = hashToken(portalToken);
    const link = await prisma.customerAccessLink.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!link || link.scope !== 'PORTAL') {
      return NextResponse.json(
        { error: { code: 'LINK_NOT_FOUND', message: 'Invalid portal link.' } },
        { status: 404 }
      );
    }

    const status = evaluateLinkStatus({
      customerId: link.customer_id,
      scope: link.scope,
      tokenHash: link.token_hash,
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      failedAttempts: link.failed_attempts,
      lockedUntil: link.locked_until,
    });
    if (status !== 'VALID') {
      return NextResponse.json(
        { error: { code: `LINK_${status}`, message: `This portal link is ${status.toLowerCase()}.` } },
        { status: 403 }
      );
    }

    invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        order: true,
        lines: { orderBy: { line_total_paise: 'asc' } },
      },
    });

    if (!invoice || invoice.customer_id !== link.customer_id) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'This portal link does not grant access to that invoice.',
          },
        },
        { status: 403 }
      );
    }
  } else if (user && ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'].includes(user.role)) {
    invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        order: true,
        lines: { orderBy: { line_total_paise: 'asc' } },
      },
    });
  } else {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication or a valid portal link is required.',
        },
      },
      { status: 401 }
    );
  }

  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found.' } },
      { status: 404 }
    );
  }

  const company = await getCompanyBranding();

  const metaLines: Array<[string, string]> = [
    ['Invoice No.', invoice.invoice_number],
    ['Invoice date', formatDateIST(invoice.issue_date)],
    ['Due date', formatDateIST(invoice.due_date)],
    ['Customer', invoice.customer.name],
    ['Phone', invoice.customer.phone],
    [
      'Billing address',
      `${invoice.customer.address}, ${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.pincode}`,
    ],
  ];
  if (invoice.order) {
    metaLines.push(['Order ref', invoice.order.order_number]);
    metaLines.push([
      'System',
      `${Number(invoice.order.capacity_kw)} kW ${String(invoice.order.system_type).replace('_', ' ')}`,
    ]);
  }
  metaLines.push(['Type', invoice.type === 'SALES' ? 'Sales Invoice' : 'Service Invoice']);
  metaLines.push(['Status', String(invoice.status)]);

  const { doc, finish } = createPdfDocument({
    title: `Tax Invoice ${invoice.invoice_number}`,
    company: {
      companyName: company.companyName,
      companyAddress: company.companyAddress,
      companyGstin: company.companyGstin,
      companyPhone: company.companyPhone,
      companyEmail: company.companyEmail,
    },
    metaLines,
  });

  // ── Line items ────────────────────────────────────────────────────────────
  const lineProductIds: string[] = invoice.lines
    .map((l: any) => l.product_id)
    .filter((id: string | null): id is string => Boolean(id));
  const hsnByProduct = new Map<string, string>();
  if (lineProductIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: lineProductIds } },
      select: { id: true, hsn_code: true },
    });
    for (const p of products) {
      if (p.hsn_code) hsnByProduct.set(p.id, p.hsn_code);
    }
  }

  drawTable(
    doc,
    [
      { key: 'description', header: 'Item', width: 226 },
      { key: 'qty', header: 'Qty', width: 55, align: 'right' },
      { key: 'hsn', header: 'HSN', width: 70, align: 'center' },
      { key: 'unit', header: 'Unit Price', width: 100, align: 'right' },
      { key: 'amount', header: 'Amount', width: 100, align: 'right' },
    ],
    invoice.lines.map((l: any) => ({
      description: l.description,
      qty: Number(l.qty),
      hsn: hsnByProduct.get(l.product_id) || '-',
      unit: inr(l.unit_price_paise),
      amount: inr(l.line_total_paise),
    }))
  );

  // ── Totals ────────────────────────────────────────────────────────────────
  const y = drawTotals(doc, [
    { label: 'Subtotal', value: inr(invoice.subtotal_paise) },
    { label: 'GST', value: inr(invoice.tax_paise) },
    { label: 'Total Payable', value: inr(invoice.total_paise), bold: true, accent: true },
  ]);

  // ── Bank details ──────────────────────────────────────────────────────────
  let cy = y + 14;
  const bankLines = [company.companyBank].filter(Boolean) as string[];
  if (bankLines.length) {
    cy = drawSection(doc, 'Payment / Bank Details', bankLines, cy);
  }
  if (company.companyGstin) {
    drawSection(doc, 'Tax Details', [`GSTIN: ${company.companyGstin}`], cy + 4);
  }

  const buffer = await finish();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: pdfResponseHeaders(`${invoice.invoice_number}.pdf`),
  });
}
