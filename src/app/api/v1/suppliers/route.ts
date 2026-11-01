import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listSuppliers, createSupplier } from '@/services/inventory'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('purchasing.read')
    return { suppliers: await listSuppliers() }
  })
}

const schema = z.object({ name: z.string().min(2), contact: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), gstin: z.string().optional() })

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    await requireCapability('purchasing.write')
    return { supplier: await createSupplier(body) }
  })
}
