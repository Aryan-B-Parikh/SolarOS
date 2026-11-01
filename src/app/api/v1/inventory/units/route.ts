import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { listUnits, lookupUnit } from '@/services/inventory'

export async function GET(req: NextRequest) {
  const sp = searchParams(req)
  const lookup = sp.get('code')
  return handler(req, async () => {
    await requireCapability('stock.read')
    if (lookup) {
      const unit = await lookupUnit(lookup)
      return { unit }
    }
    return { units: await listUnits({ status: sp.get('status') ?? undefined, q: sp.get('q') ?? undefined }) }
  })
}
