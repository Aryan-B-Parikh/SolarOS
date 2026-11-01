import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { certificateByToken } from '@/services/portal'

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return handler(req, async () => {
    const data = await certificateByToken(token)
    const i = data.installation
    return {
      company: { name: data.settings.companyName, gstin: data.settings.gstin, address: data.settings.address, phone: data.settings.phone },
      orderNumber: i.order.orderNumber,
      customerName: i.order.customer.name,
      site: `${i.order.customer.addressLine}, ${i.order.customer.city} ${i.order.customer.pincode}`,
      capacityKw: i.installedCapacityKw,
      systemType: i.order.systemType,
      startedAt: i.startedAt, finishedAt: i.finishedAt,
      signedName: i.signedName, signedAt: i.signedAt,
      signoffHash: i.signoffHash,
      testReadingW: i.testReadingW,
      crew: i.crew.map((c: any) => c.technician.user.name),
      units: data.units.map((u: any) => ({
        product: u.product.name,
        serial: u.serialNumber,
        qrCode: u.qrCode,
        warrantyEnd: u.warranties.find((w: any) => w.status === 'ACTIVE')?.endDate ?? null,
      })),
      viaPortal: data.viaPortal,
    }
  })
}
