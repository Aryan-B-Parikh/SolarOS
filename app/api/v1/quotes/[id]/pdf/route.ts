import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { formatPaise } from '@/lib/money';
import { formatDateIST } from '@/lib/dates';
import { getSessionUser } from '@/lib/session';
import { getQuoteByPublicToken } from '@/services/quotes';
import { AppError } from '@/lib/errors';
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
 * Quote PDF (FR-3.5 / X-SEC-PDF).
 *
 * Access is granted to:
 *  - authenticated staff (session cookie), or
 *  - anyone holding a valid, unexpired quote token via ?token=<rawToken>
 *    (the same token that was shared with the customer).
 * A bare quote UUID grants nothing.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const quoteId = parts[parts.indexOf('quotes') + 1];
  const token = url.searchParams.get('token') || '';

  const user = await getSessionUser();

  let quote: any;

  if (token) {
    // Customer path: validate the shared token, then match the quote
    const result = await getQuoteByPublicToken(token).catch(() => null);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'LINK_NOT_FOUND', message: 'Invalid or expired quote link.' } },
        { status: 404 }
      );
    }
    if (result.quote.id !== quoteId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'This link does not grant access to that quote.' } },
        { status: 403 }
      );
    }
    quote = result.quote;
  } else if (user && ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'].includes(user.role)) {
    quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        customer: true,
        lead: { include: { assessment: true } },
        template: true,
        lines: { include: { product: true }, orderBy: { sort_order: 'asc' } },
      },
    });
  } else {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication or a valid quote link is required.' } },
      { status: 401 }
    );
  }

  if (!quote) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Quote not found.' } },
      { status: 404 }
    );
  }

  // Company branding from settings (FR-3.5: logo placeholder, GSTIN, bank)
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
        ],
      },
    },
  });
  const getSetting = (k: string, def: string) => {
    const s = settings.find((item) => item.key === k);
    const v: unknown = (s?.value as any)?.value ?? s?.value;
    return typeof v === 'string' && v.length ? v : def;
  };

  const company = {
    companyName: getSetting('company_name', 'SunPower Solar Systems Pvt Ltd'),
    companyAddress: getSetting('company_address', '401 SunPower Tower, SG Highway, Ahmedabad, Gujarat 380054'),
    companyGstin: getSetting('company_gstin', '24AAACS1429B1Z8'),
    companyBank: getSetting('company_bank_details', 'HDFC Bank, A/C: 50200012345678, IFSC: HDFC0000123'),
    companyPhone: getSetting('company_phone', '+91 98250 12345'),
    companyEmail: getSetting('company_email', 'care@sunpower.example'),
  };

  const assessment = quote.lead?.assessment;

  const { doc, finish } = createPdfDocument({
    title: `Quotation ${quote.quote_number}${quote.version > 1 ? ` (v${quote.version})` : ''}`,
    company,
    metaLines: [
      ['Date', formatDateIST(quote.created_at)],
      ['Valid until', formatDateIST(quote.valid_until)],
      ['Customer', quote.customer.name],
      ['Phone', quote.customer.phone],
      [
        'Site address',
        `${quote.customer.address}, ${quote.customer.city}, ${quote.customer.state} ${quote.customer.pincode}`,
      ],
      ['System', `${Number(quote.capacity_kw)} kW ${quote.system_type.replace('_', ' ')}`],
    ],
  });

  // ── Line items ────────────────────────────────────────────────────────────
  drawTable(
    doc,
    [
      { key: 'description', header: 'Item', width: 250 },
      { key: 'qty', header: 'Qty', width: 60, align: 'right' },
      { key: 'unit', header: 'Unit Price', width: 95, align: 'right' },
      { key: 'amount', header: 'Amount', width: 95, align: 'right' },
    ],
    quote.lines.map((l: any) => ({
      description: l.description || l.product?.name,
      qty: Number(l.qty),
      unit: inr(l.unit_price_paise),
      amount: inr(l.unit_price_paise * BigInt(Math.round(Number(l.qty) * 1000)) / 1000n),
    }))
  );

  // ── Totals ────────────────────────────────────────────────────────────────
  const advance = quote.total_paise / 2n;
  const y = drawTotals(doc, [
    { label: 'Subtotal', value: inr(quote.subtotal_paise) },
    ...(quote.discount_paise > 0n
      ? [{ label: 'Discount', value: `- ${inr(quote.discount_paise)}` }]
      : []),
    { label: 'GST (18%)', value: inr(quote.tax_paise) },
    { label: 'Total', value: inr(quote.total_paise), bold: true, accent: true },
    ...(quote.subsidy_estimate_paise > 0n
      ? [{ label: 'Est. govt subsidy (PM Surya Ghar)', value: `- ${inr(quote.subsidy_estimate_paise)}` }]
      : []),
    { label: 'Advance payable on confirmation (50%)', value: inr(advance), bold: true },
  ]);

  // ── Bank details ──────────────────────────────────────────────────────────
  let cy = y + 14;
  cy = drawSection(doc, 'Payment / Bank Details', [company.companyBank], cy);

  // ── Savings summary (FR-3.5) ──────────────────────────────────────────────
  if (assessment) {
    const annualSavings = Number(assessment.annual_savings_paise) / 100;
    const twentyFiveYear = annualSavings * 25;
    drawSection(
      doc,
      'Your Savings Summary',
      [
        `Recommended system: ${Number(assessment.recommended_kw)} kW ${assessment.recommended_type.replace('_', ' ')}`,
        `Expected generation: ${Math.round(Number(assessment.annual_generation_kwh)).toLocaleString('en-IN')} units/year`,
        `Estimated savings: Rs. ${Math.round(annualSavings).toLocaleString('en-IN')} per year`,
        `Projected 25-year savings: Rs. ${Math.round(twentyFiveYear).toLocaleString('en-IN')}`,
        `Indicative payback: ${Number(assessment.payback_years).toFixed(1)} years`,
        `Quote validity: ${formatDateIST(quote.valid_until)}. Accept online or call ${company.companyPhone}.`,
      ],
      cy + 4
    );
  } else {
    drawSection(
      doc,
      'Next Steps',
      [
        `Quote validity: ${formatDateIST(quote.valid_until)}.`,
        `Accept online via your personal quote link or call ${company.companyPhone}.`,
      ],
      cy + 4
    );
  }

  const buffer = await finish();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: pdfResponseHeaders(`${quote.quote_number}.pdf`),
  });
}
