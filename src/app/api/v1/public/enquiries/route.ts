import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { rateLimit, sha256 } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { createLeadFromEnquiry } from '@/services/leads'
import { db } from '@/lib/db'

const schema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(10).max(16),
  addressLine: z.string().min(5).max(200),
  city: z.string().min(2).max(80),
  pincode: z.string().regex(/^\d{6}$/),
  requestedCapacityKw: z.number().min(0.5).max(5).nullable().optional(),
  systemTypePref: z.enum(['ON_GRID', 'OFF_GRID']).nullable().optional(),
  wantsSubsidy: z.boolean().optional(),
  monthlyBillRupees: z.number().min(0).max(100000).nullable().optional(),
  // free-text from the public form (e.g. the AI bill-scan line); lands as a
  // NOTE activity on the lead — no DB schema change needed
  notes: z.string().max(600).optional(),
  consent: z.literal(true),
  honeypot: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit('enquiry:' + ip, 5, 60000)) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many submissions. Please try again in a minute.', requestId: 'rate' } }, { status: 429 })
  }
  return handlerWithSchema(req, schema, async ({ body }) => {
    const result = await createLeadFromEnquiry({
      name: body.name,
      phone: body.phone,
      addressLine: body.addressLine,
      city: body.city,
      pincode: body.pincode,
      requestedCapacityKw: body.requestedCapacityKw ?? null,
      systemTypePref: body.systemTypePref ?? null,
      wantsSubsidy: body.wantsSubsidy ?? false,
      monthlyBillPaise: body.monthlyBillRupees ? Math.round(body.monthlyBillRupees * 100) : null,
      notes: body.notes,
      consent: body.consent,
      source: 'WEB_FORM',
      honeypot: body.honeypot,
    }, { requestId: 'public' })
    void sha256
    void db
    return {
      reference: result.lead.leadNumber,
      customerNumber: result.customer.customerNumber,
      isNewCustomer: result.isNewCustomer,
      duplicateFlags: result.duplicateFlags,
      // security: the raw portal token is returned ONLY for a brand-new customer
      // (their own first enquiry). An existing customer's persistent link is
      // re-sent to the phone on file — never handed to the anonymous caller.
      portalToken: result.portalToken,
      message: result.isNewCustomer
        ? 'Your personal SunPower link is ready and was also sent by SMS.'
        : 'We found your SunPower account and re-sent your personal link to the phone number on file.',
    }
  })
}
