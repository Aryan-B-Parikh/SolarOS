import React from 'react';
import Link from 'next/link';
import { getQuoteByPublicToken } from '@/services/quotes';
import { prisma } from '@/lib/db';
import { formatPaise } from '@/lib/money';
import { formatDateIST } from '@/lib/dates';
import QuoteClientView from './QuoteClientView';

interface QuotePageProps {
  params: { token: string };
}

export default async function PublicQuotePage({ params }: QuotePageProps) {
  const rawToken = params.token;

  let quoteData: any = null;
  let loadError: string | null = null;

  try {
    const { quote, isExpired } = await getQuoteByPublicToken(rawToken);

    // Fetch company settings
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'company_name',
            'company_address',
            'company_gstin',
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
    const maskedPhone =
      cleanPhone.length >= 4
        ? '••••••' + cleanPhone.slice(-4)
        : '••••';

    const assessment = quote.lead?.assessment;

    quoteData = {
      quoteNumber: quote.quote_number,
      version: quote.version,
      status: isExpired && quote.status === 'SENT' ? 'EXPIRED' : quote.status,
      capacityKw: Number(quote.capacity_kw),
      systemType: quote.system_type,
      cableDistanceM: Number(quote.cable_distance_m),
      subtotalFormatted: formatPaise(quote.subtotal_paise),
      discountFormatted: formatPaise(quote.discount_paise),
      taxFormatted: formatPaise(quote.tax_paise),
      totalFormatted: formatPaise(quote.total_paise),
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
      lines: quote.lines.map((l: any) => ({
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
  } catch (err: any) {
    loadError = err.message || 'Unable to retrieve quotation';
  }

  if (loadError || !quoteData) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            🔍
          </div>
          <h1 className="text-xl font-bold text-slate-900">Quotation Not Found</h1>
          <p className="text-slate-600 text-sm mt-2">
            The link you followed may be invalid, expired, or superseded by a newer quotation version.
          </p>
          <div className="mt-6 flex flex-col space-y-2">
            <Link
              href="/portal-link-request"
              className="py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-xs transition"
            >
              Request Fresh Access Link
            </Link>
            <Link
              href="/enquiry"
              className="py-2 px-4 text-slate-500 hover:text-slate-700 text-xs font-medium"
            >
              Submit New Solar Enquiry
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <QuoteClientView quote={quoteData} token={rawToken} />;
}

