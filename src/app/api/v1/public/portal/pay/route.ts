import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { portalPay } from '@/services/portal-payments'

// T2: start an online payment from the customer portal. Auth is the PORTAL
// link token in the body (same verifyLink() check every public portal
// endpoint does); the amount defaults to the order's outstanding balance.
const paySchema = z.object({
  token: z.string().min(10).max(200),
  orderId: z.string().min(6).max(64),
  amountInPaise: z.number().int().positive().max(1_000_000_000).optional(),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, paySchema, async ({ body }) => {
    return await portalPay(body.token, body.orderId, body.amountInPaise)
  })
}
