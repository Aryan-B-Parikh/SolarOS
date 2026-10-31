import { NextRequest, NextResponse } from 'next/server';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import prisma from '@/lib/db';
import { AppError, formatErrorResponse } from '@/lib/errors';
import { formatDateIST } from '@/lib/dates';
import {
  createPdfDocument,
  drawSection,
  drawTable,
  drawTotals,
  pdfResponseHeaders,
  setCursorY,
} from '@/lib/pdf';

export const dynamic = 'force-dynamic';

/**
 * FR-10.5 — per-unit warranty certificate PDF for the customer portal.
 * Validates the portal link, verifies the unit belongs to that customer's
 * installation, then renders a branded certificate via src/lib/pdf.ts.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; unitId: string } }
) {
  try {
    const rawToken = params.token;
    const tokenHash = hashToken(rawToken);

    const link = await prisma.customerAccessLink.findUnique({
      where: { token_hash: tokenHash },
      include: { customer: true },
    });

    if (!link) {
      throw new AppError('LINK_NOT_FOUND', 'Invalid access link', 404);
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
      throw new AppError(`LINK_${status}`, `This portal access link is ${status.toLowerCase()}`, 403);
    }

    const customer = link.customer;

    // The unit must belong to this customer and carry a warranty.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.unitId);
    const unit = await prisma.inventoryUnit.findFirst({
      where: {
        customer_id: customer.id,
        OR: isUuid
          ? [{ id: params.unitId }, { qr_code: params.unitId }, { serial_number: params.unitId }]
          : [{ qr_code: params.unitId }, { serial_number: params.unitId }],
      },
      include: {
        product: true,
        installation: { include: { order: { select: { order_number: true } } } },
        warranties: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    });

    if (!unit) {
      throw new AppError('NOT_FOUND', 'Equipment unit not found for this customer', 404);
    }

    const warranty = unit.warranties[0];
    if (!warranty) {
      throw new AppError('NOT_FOUND', 'No warranty record exists for this unit', 404);
    }

    // Company branding from settings (GSTIN required on the certificate).
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['company_name', 'company_address', 'company_gstin', 'company_phone', 'company_email'] },
      },
    });
    const getSetting = (k: string, def: string) => {
      const s: any = settings.find((item) => item.key === k);
      const v: unknown = s?.value?.value ?? s?.value;
      return typeof v === 'string' && v.length ? v : def;
    };

    const company = {
      companyName: getSetting('company_name', 'SunPower Solar Systems Pvt Ltd'),
      companyAddress: getSetting('company_address', '401 SunPower Tower, SG Highway, Ahmedabad, Gujarat 380054'),
      companyGstin: getSetting('company_gstin', '24AAACS1429B1Z8'),
      companyPhone: getSetting('company_phone', '+91 98250 12345'),
      companyEmail: getSetting('company_email', 'care@sunpower.example'),
    };

    const today = new Date();
    const endDate = warranty.end_date;
    const isActive =
      warranty.status === 'ACTIVE' && endDate.getTime() >= today.getTime();
    const coverageStatus = warranty.status === 'ACTIVE'
      ? isActive
        ? 'ACTIVE'
        : 'EXPIRED'
      : warranty.status;

    const { doc, finish } = createPdfDocument({
      title: 'Warranty Certificate',
      company,
      metaLines: [
        ['Certificate ref', `WC-${warranty.id.slice(0, 8).toUpperCase()}`],
        ['Issued on', formatDateIST(today)],
        ['Customer', customer.name],
        ['Customer no.', customer.customer_number],
        ['Phone', customer.phone],
        [
          'Site address',
          `${customer.address}, ${customer.city}, ${customer.state} ${customer.pincode}`,
        ],
        ['Order ref', unit.installation?.order?.order_number || '-'],
      ],
    });

    // ── Equipment details ─────────────────────────────────────────────────────
    let y = drawSection(doc, 'Equipment Covered', [
      `Product: ${unit.product.name}`,
      `Brand / Model: ${unit.product.brand} ${unit.product.model}`,
      `Serial Number: ${unit.serial_number}`,
      `QR Code: ${unit.qr_code}`,
    ]);

    // ── Coverage table ────────────────────────────────────────────────────────
    setCursorY(doc, y + 4);
    y = drawTable(
      doc,
      [
        { key: 'coverage', header: 'Coverage', width: 130 },
        { key: 'term', header: 'Term', width: 90 },
        { key: 'start', header: 'Start Date', width: 130 },
        { key: 'end', header: 'End Date', width: 99 },
      ],
      [
        {
          coverage: `${warranty.coverage} WARRANTY`,
          term: `${warranty.months} months`,
          start: formatDateIST(warranty.start_date),
          end: formatDateIST(warranty.end_date),
        },
      ]
    );

    // ── Status block ──────────────────────────────────────────────────────────
    setCursorY(doc, y + 6);
    y = drawTotals(doc, [
      {
        label: 'Warranty status',
        value: coverageStatus,
        bold: true,
        accent: true,
      },
    ]);

    // ── Terms ─────────────────────────────────────────────────────────────────
    drawSection(
      doc,
      'Terms & Conditions',
      [
        'This certificate covers the equipment identified above against manufacturing defects for the stated term,',
        'subject to the original supply and installation agreement.',
        'Warranty is void in case of physical damage, unauthorized tampering or repair by third parties.',
        'Replacement units inherit the remaining term of the original warranty.',
        'This certificate is computer generated.',
      ],
      y + 10
    );

    const buffer = await finish();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: pdfResponseHeaders(`warranty-${unit.serial_number}.pdf`),
    });
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
