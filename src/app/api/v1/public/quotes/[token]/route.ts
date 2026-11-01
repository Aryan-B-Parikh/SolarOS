import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { portalQuoteView } from '@/services/portal'
import { getSettings } from '@/lib/settings'

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return handler(req, async () => {
    const { quote, viaPortal } = await portalQuoteView(token)
    const settings = await getSettings()
    return { quote: serializeQuote(quote), viaPortal, branding: brandingOf(settings) }
  })
}

function brandingOf(s: {
  companyName: string; gstin: string; address: string; phone: string; email: string; bankDetails: string
}) {
  return { companyName: s.companyName, gstin: s.gstin, address: s.address, phone: s.phone, email: s.email, bankDetails: s.bankDetails }
}

function serializeQuote(q: any) {
  return {
    quoteNumber: q.quoteNumber, status: q.status, version: q.version,
    capacityKw: q.capacityKw, systemType: q.systemType, cableDistanceM: q.cableDistanceM,
    subtotalPaise: q.subtotalPaise, discountPaise: q.discountPaise, taxPaise: q.taxPaise,
    totalPaise: q.totalPaise, subsidyEstimatePaise: q.subsidyEstimatePaise,
    validUntil: q.validUntil,
    lines: (q.lines ?? []).map((l: any) => ({
      description: l.description, qty: l.qty, uom: l.product?.uom ?? 'NOS',
      unitPricePaise: l.unitPricePaise, lineTotalPaise: l.lineTotalPaise, rule: l.rule,
    })),
    savings: q.lead?.assessments?.[0]
      ? {
          annualGenerationKwh: q.lead.assessments[0].annualGenerationKwh,
          annualSavingsPaise: q.lead.assessments[0].annualSavingsPaise,
          recommendedKw: q.lead.assessments[0].recommendedKw,
          paybackYears: q.lead.assessments[0].paybackYears,
        }
      : null,
    customerName: q.lead?.customer?.name ?? null,
    acceptedName: q.acceptedName, acceptedAt: q.acceptedAt, rejectReason: q.rejectReason, rejectedAt: q.rejectedAt,
  }
}
