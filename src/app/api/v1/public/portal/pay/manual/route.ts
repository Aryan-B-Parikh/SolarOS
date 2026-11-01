import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { portalRecordManualPayment } from '@/services/portal-payments'

const schema = z.object({
  token: z.string().min(10),
  orderId: z.string().min(1).optional(),
  invoiceId: z.string().min(1).optional(),
  method: z.enum(['CASH', 'NEFT', 'CHEQUE', 'UPI']),
  amountInPaise: z.number().int().positive().optional(),
  reference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
}).refine((d) => d.orderId || d.invoiceId, { message: 'Either orderId or invoiceId is required.' })

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json()
    const parsed = schema.parse(raw)
    const result = await portalRecordManualPayment({
      token: parsed.token,
      orderId: parsed.orderId,
      invoiceId: parsed.invoiceId,
      method: parsed.method,
      amountInPaise: parsed.amountInPaise,
      reference: parsed.reference,
      notes: parsed.notes,
    })
    return Response.json(result)
  } catch (err: any) {
    const status = err?.status || 400
    return Response.json({
      error: {
        code: err?.code || 'VALIDATION_FAILED',
        message: err?.message || 'Payment could not be processed.',
      }
    }, { status })
  }
}
