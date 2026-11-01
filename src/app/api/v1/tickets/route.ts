import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listTickets, openTicket } from '@/services/tickets'

export async function GET(req: NextRequest) {
  const status = searchParams(req).get('status') ?? undefined
  return handler(req, async () => {
    await requireCapability('tickets.read')
    return { tickets: await listTickets(status) }
  })
}

const schema = z.object({
  customerId: z.string(),
  unitId: z.string().nullable().optional(),
  channel: z.enum(['PHONE', 'WHATSAPP', 'WEB', 'VISIT', 'MAINTENANCE_ALERT']),
  category: z.enum(['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER']),
  faultCode: z.string().optional().nullable(),
  description: z.string().min(2).max(1000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('tickets.write')
    return { ticket: await openTicket({ ...body, createdBy: user.id }) }
  })
}
