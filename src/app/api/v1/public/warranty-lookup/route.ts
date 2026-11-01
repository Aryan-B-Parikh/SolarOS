import { NextRequest, NextResponse } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { rateLimit } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { warrantyCheck } from '@/services/tickets'

// Public warranty self-check by serial number (no auth, rate-limited).
// Returns only non-sensitive fields — never the customer's name or phone.

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit(`wlookup:${ip}`, 10, 60000)) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many lookups. Please try again in a minute.', requestId: 'rate' } }, { status: 429 })
  }
  return handler(req, async () => {
    const serial = (searchParams(req).get('serial') ?? '').trim()
    if (!serial) {
      throw new AppError('VALIDATION_FAILED', 'Please enter the serial number printed on the equipment label.')
    }
    const r = await warrantyCheck(serial)
    if (!r.unit) {
      throw new AppError('NOT_FOUND', 'We could not find that serial number. Check the label on the equipment or your completion certificate.')
    }
    return {
      unit: { serialNumber: r.unit.serialNumber, product: r.unit.product, status: r.unit.status },
      warranty: r.warranty,
      verdict: r.verdict,
    }
  })
}
