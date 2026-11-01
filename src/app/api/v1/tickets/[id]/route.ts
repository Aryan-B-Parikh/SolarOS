import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { ticketDetail } from '@/services/tickets'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('tickets.read')
    return { ticket: await ticketDetail(id) }
  })
}
