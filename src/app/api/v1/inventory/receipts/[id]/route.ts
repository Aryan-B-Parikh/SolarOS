import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { warrantyUrl, qrDataUrl, requestOrigin } from '@/lib/qr'

// QR label sheet data for an existing receipt (FR-5.9): each serialized unit's
// QR encodes an absolute URL to the public warranty page /w/{qrCode}
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('stock.read')
    const receipt = await db.purchaseReceipt.findUnique({ where: { id }, include: { lines: { include: { product: true } } } })
    if (!receipt) throw new AppError('NOT_FOUND', 'Receipt not found.')
    const units = await db.inventoryUnit.findMany({
      where: { receiptLineId: { in: receipt.lines.map((l) => l.id) } },
      include: { product: true },
    })
    const origin = requestOrigin(req)
    const labels = await Promise.all(units.map(async (u) => ({
      serial: u.serialNumber, qr: u.qrCode, product: u.product.name, brand: u.product.brand,
      qrDataUrl: await qrDataUrl(warrantyUrl(origin, u.qrCode ?? u.serialNumber)),
    })))
    return { receipt: { receiptNumber: receipt.receiptNumber, receivedOn: receipt.receivedOn, supplierName: receipt.supplierName }, labels }
  })
}
