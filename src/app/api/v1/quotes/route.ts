import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listQuotes, createQuote } from '@/services/quotes'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('leads.read')
    return { quotes: await listQuotes() }
  })
}

const schema = z.object({ leadId: z.string(), templateCode: z.string(), discountRupees: z.number().min(0).optional() })

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('leads.write')
    const quote = await createQuote({
      leadId: body.leadId, templateCode: body.templateCode,
      discountPaise: body.discountRupees ? Math.round(body.discountRupees * 100) : 0,
      actorId: user.id,
    })
    return { quote }
  })
}
