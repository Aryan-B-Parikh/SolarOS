import { NextRequest, NextResponse } from 'next/server';
import { getQuoteByPublicToken } from '@/services/quotes';
import { prisma } from '@/lib/db';
import { formatPaise } from '@/lib/money';
import { formatDateIST } from '@/lib/dates';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token;
    if (!rawToken || rawToken.length < 16) {
      return NextResponse.json(
        { error: { code: 'INVALID_TOKEN', message: 'Invalid or missing quote access token.' } },
        { status: 400 }
      );
    }

    const { quote, link, isExpired } = await getQuoteByPublicToken(rawToken);

    // Company branding settings
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

    const cleanPhone = quote.customer.phone.replace(/\D/g, '');
    const maskedPhone = cleanPhone.length >= 4 
      ? '••••••' + cleanPhone.slice(-4)
      : '••••';

    const assessment = quote.lead?.assessment;

    const publicData = {
      quoteNumber: quote.quote_number,
      version: quote.version,
      status: isExpired && quote.status === 'SENT' ? 'EXPIRED' : quote.status,
      capacityKw: Number(quote.capacity_kw),
      systemType: quote.system_type,
      cableDistanceM: Number(quote.cable_distance_m),
      subtotalPaise: quote.subtotal_paise.toString(),
      subtotalFormatted: formatPaise(quote.subtotal_paise),
      discountPaise: quote.discount_paise.toString(),
      discountFormatted: formatPaise(quote.discount_paise),
      taxPaise: quote.tax_paise.toString(),
      taxFormatted: formatPaise(quote.tax_paise),
      totalPaise: quote.total_paise.toString(),
      totalFormatted: formatPaise(quote.total_paise),
      subsidyEstimatePaise: quote.subsidy_estimate_paise.toString(),
      subsidyEstimateFormatted: formatPaise(quote.subsidy_estimate_paise),
      validUntil: quote.valid_until.toISOString(),
      validUntilFormatted: formatDateIST(quote.valid_until),
      sentAt: quote.sent_at?.toISOString() || null,
      acceptedAt: quote.accepted_at?.toISOString() || null,
      acceptedName: quote.accepted_name || null,
      rejectedAt: quote.rejected_at?.toISOString() || null,
      rejectReason: quote.reject_reason || null,
      isExpired,
      customer: {
        name: quote.customer.name,
        maskedPhone,
        address: quote.customer.address,
        pincode: quote.customer.pincode,
      },
      lines: quote.lines.map((l) => ({
        id: l.id,
        description: l.description,
        qty: l.qty,
        rule: l.rule,
        unitPriceFormatted: formatPaise(l.unit_price_paise),
        taxRatePercent: l.tax_rate_bp / 100,
        lineTotalFormatted: formatPaise(l.line_total_paise),
      })),
      savings: {
        annualSavingsRupees: assessment?.annual_savings_rupees || 34493,
        annualGenerationKwh: assessment?.annual_generation_kwh || 4928,
        paybackYears: assessment?.payback_years ? Number(assessment.payback_years) : 4.2,
      },
      company: {
        name: getSetting('company_name', 'SunPower Solar Systems Pvt Ltd'),
        address: getSetting('company_address', '401 SunPower Tower, SG Highway, Ahmedabad, Gujarat 380054'),
        gstin: getSetting('company_gstin', '24AAACS1429B1Z8'),
        phone: getSetting('company_phone', '+91 98765 43210'),
        email: getSetting('company_email', 'support@sunpowersolar.in'),
      },
      pdfUrl: `/api/v1/quotes/${quote.id}/pdf`,
    };

    const response = NextResponse.json(publicData);
    response.headers.set('X-Robots-Tag', 'noindex, no-referrer');
    return response;
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      {
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Failed to load quotation',
        },
      },
      { status }
    );
  }
}
