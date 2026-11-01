import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { receiveStock } from '@/services/inventory'
import { requestOrigin } from '@/lib/qr'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('stock.read')
    const receipts = await db.purchaseReceipt.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { lines: { include: { product: true } } } })
    return { receipts }
  })
}

const schema = z.object({
  supplierName: z.string().min(2),
  supplierId: z.string().nullable().optional(),
  poId: z.string().nullable().optional(),
  supplierInvoiceRef: z.string().optional(),
  receivedOn: z.string().optional(),
  lines: z.array(z.object({
    productId: z.string(), qty: z.number().int().positive(),
    unitCostRupees: z.number().positive(),
    serialNumbers: z.array(z.string()).optional(),
  })).min(1),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('stock.write')
    // Origin so QR labels carry an absolute warranty URL (FR-5.2/FR-5.9);
    // fall back to the forwarded host so labels never encode localhost
    const origin = requestOrigin(req)
    return await receiveStock({
      supplierName: body.supplierName, supplierId: body.supplierId ?? null, poId: body.poId ?? null,
      supplierInvoiceRef: body.supplierInvoiceRef, receivedOn: body.receivedOn,
      lines: body.lines.map((l) => ({
        productId: l.productId, qty: l.qty, unitCostPaise: Math.round(l.unitCostRupees * 100),
        serialNumbers: l.serialNumbers,
      })),
      origin,
      actorId: user.id,
    })
  })
}
