import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { stockOverview } from '@/services/inventory'

export async function GET(req: NextRequest) {
  const lowOnly = searchParams(req).get('low') === '1'
  return handler(req, async () => {
    await requireCapability('stock.read')
    const rows = await stockOverview({ lowOnly })
    return { stock: rows.map(({ _threshold, ...r }) => r) }
  })
}
