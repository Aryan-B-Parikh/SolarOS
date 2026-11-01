import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { purchaseOrderDetail } from '@/services/inventory'

// PO detail (FR-5.8): supplier, lines with product and received quantities,
// and the receipts booked against it.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('purchasing.read')
    return { purchaseOrder: await purchaseOrderDetail(id) }
  })
}
