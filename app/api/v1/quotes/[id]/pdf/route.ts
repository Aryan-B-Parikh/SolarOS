import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { formatPaise } from '@/lib/money';
import { formatDateIST } from '@/lib/dates';
import { notFound } from 'next/navigation';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const quoteId = parts[parts.indexOf('quotes') + 1];

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      lead: { include: { assessment: true } },
      template: true,
      lines: {
        include: { product: true },
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!quote) return notFound();

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
    return s && typeof s.value === 'string' ? s.value : def;
  };

  const companyName = getSetting('company_name', 'SunPower Solar Systems Pvt Ltd');
  const companyAddress = getSetting('company_address', '401 SunPower Tower, SG Highway, Ahmedabad, Gujarat 380054');
  const companyGstin = getSetting('company_gstin', '24AAACS1429B1Z8');
  const companyBank = getSetting('company_bank_details', 'HDFC Bank, A/C: 50200012345678, IFSC: HDFC0000123');

  const assessment = quote.lead?.assessment;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quotation ${quote.quote_number} - ${companyName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; max-width: 800px; margin: 0 auto; background: #fff; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
    .brand-title { font-size: 24px; font-weight: 800; color: #1d4ed8; }
    .brand-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .quote-title { font-size: 20px; font-weight: 700; text-align: right; color: #0f172a; }
    .quote-meta { font-size: 12px; color: #64748b; text-align: right; margin-top: 4px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; font-size: 13px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; letter-spacing: 0.5px; }
    .summary-card { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; text-align: center; }
    .summary-item .label { font-size: 11px; color: #1e40af; }
    .summary-item .val { font-size: 16px; font-weight: 700; color: #1d4ed8; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 10px; text-align: left; font-weight: 700; color: #475569; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
    .text-right { text-align: right; }
    .totals-box { margin-left: auto; width: 300px; font-size: 13px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals-row.grand-total { border-top: 2px solid #0f172a; font-size: 16px; font-weight: 800; color: #0f172a; padding-top: 8px; margin-top: 4px; }
    .bank-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 12px; margin-top: 24px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; text-align: right;">
    <button onclick="window.print()" style="background: #1d4ed8; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
      Print / Save PDF
    </button>
  </div>

  <div class="header">
    <div>
      <div class="brand-title">${companyName}</div>
      <div class="brand-sub">${companyAddress}</div>
      <div class="brand-sub">GSTIN: ${companyGstin}</div>
    </div>
    <div>
      <div class="quote-title">SOLAR QUOTATION</div>
      <div class="quote-meta">Quote No: <strong>${quote.quote_number}</strong> (v${quote.version})</div>
      <div class="quote-meta">Date: ${formatDateIST(quote.created_at)}</div>
      <div class="quote-meta">Valid Until: ${formatDateIST(quote.valid_until)}</div>
    </div>
  </div>

  <div class="details-grid">
    <div>
      <div class="section-title">Customer Details</div>
      <div style="font-weight: 700;">${quote.customer.name}</div>
      <div>${quote.customer.address}</div>
      <div>${quote.customer.city || 'Ahmedabad'}, Gujarat - ${quote.customer.pincode}</div>
      <div>Phone: ${quote.customer.phone}</div>
    </div>
    <div>
      <div class="section-title">System Specification</div>
      <div>System Type: <strong>${quote.system_type === 'OFF_GRID' ? 'Off-Grid with Battery' : 'On-Grid Net Metering'}</strong></div>
      <div>Proposed Capacity: <strong>${quote.capacity_kw} kW</strong></div>
      <div>Cable Distance Run: <strong>${quote.cable_distance_m} m</strong></div>
      <div>Template Model: ${quote.template?.name || 'Standard Residential'}</div>
    </div>
  </div>

  ${assessment ? `
  <div class="summary-card">
    <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 8px;">
      ESTIMATED ENERGY & SAVINGS YIELD (Label: Estimate)
    </div>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="label">Recommended Size</div>
        <div class="val">${assessment.recommended_kw} kW</div>
      </div>
      <div class="summary-item">
        <div class="label">Annual Generation</div>
        <div class="val">${Number(assessment.annual_generation_kwh).toLocaleString()} kWh</div>
      </div>
      <div class="summary-item">
        <div class="label">Annual Savings</div>
        <div class="val">${formatPaise(assessment.annual_savings_paise)}</div>
      </div>
      <div class="summary-item">
        <div class="label">Est. Payback Period</div>
        <div class="val">${assessment.payback_years} Years</div>
      </div>
    </div>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th style="width: 50px;">#</th>
        <th>Item Description</th>
        <th class="text-right" style="width: 80px;">Qty</th>
        <th class="text-right" style="width: 110px;">Unit Rate</th>
        <th class="text-right" style="width: 70px;">GST</th>
        <th class="text-right" style="width: 120px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${quote.lines.map((l, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${l.description}</strong></td>
          <td class="text-right">${Number(l.qty)}</td>
          <td class="text-right">${formatPaise(l.unit_price_paise)}</td>
          <td class="text-right">${(l.tax_rate_bp / 100).toFixed(0)}%</td>
          <td class="text-right font-bold">${formatPaise(l.line_total_paise)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals-box">
    <div class="totals-row">
      <span style="color: #64748b;">Subtotal (excl. Tax):</span>
      <span>${formatPaise(quote.subtotal_paise)}</span>
    </div>
    ${quote.discount_paise > 0n ? `
    <div class="totals-row" style="color: #15803d;">
      <span>Special Discount:</span>
      <span>-${formatPaise(quote.discount_paise)}</span>
    </div>
    ` : ''}
    <div class="totals-row">
      <span style="color: #64748b;">GST Total:</span>
      <span>${formatPaise(quote.tax_paise)}</span>
    </div>
    <div class="totals-row grand-total">
      <span>Final Net Payable:</span>
      <span>${formatPaise(quote.total_paise)}</span>
    </div>
    ${quote.subsidy_estimate_paise > 0n ? `
    <div class="totals-row" style="color: #15803d; font-size: 12px; margin-top: 4px;">
      <span>* Est. PM Surya Ghar Subsidy:</span>
      <span>${formatPaise(quote.subsidy_estimate_paise)}</span>
    </div>
    <div style="font-size: 10px; color: #94a3b8; text-align: right;">
      (Subsidy directly credited to customer account by DISCOM/MNRE post inspection)
    </div>
    ` : ''}
  </div>

  <div class="bank-box">
    <div style="font-weight: 700; color: #334155; margin-bottom: 4px;">Payment & Bank Information:</div>
    <div>Bank Details: <strong>${companyBank}</strong></div>
    <div>Advance Amount for Order Confirmation (30%): <strong>${formatPaise(BigInt(Math.round(Number(quote.total_paise) * 0.3)))}</strong></div>
  </div>

  <div class="footer">
    This is an authentic computer generated document from SunPower Installation Management System.<br/>
    For enquiries contact us at sales@sunpower.com
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

