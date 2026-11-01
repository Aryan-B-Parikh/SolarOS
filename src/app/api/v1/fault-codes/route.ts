import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'

// FR-7.9: per-model fault-code list for ticket forms (free text still allowed).
export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('tickets.read')
    const model = req.nextUrl.searchParams.get('model')
    const codes = await db.faultCode.findMany({
      where: model ? { productModel: model } : undefined,
      orderBy: [{ productModel: 'asc' }, { code: 'asc' }],
    })
    return { codes }
  })
}
