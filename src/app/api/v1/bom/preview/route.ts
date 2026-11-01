import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { previewBom } from '@/services/quotes'

const schema = z.object({ templateCode: z.string(), capacityKw: z.number().min(0.5).max(5), cableDistanceM: z.number().nullable().optional() })

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    await requireCapability('leads.read')
    return await previewBom(body.templateCode, body.capacityKw, body.cableDistanceM ?? null)
  })
}
