import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { getSettings } from '@/lib/settings'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handler(req, async () => {
    await requireCapability('payments.read')
    const invoice = await db.invoice.findFirst({
      where: { OR: [{ id }, { invoiceNumber: id }] },
      include: {
        lines: true,
        order: { select: { orderNumber: true } },
        customer: { select: { name: true } },
      },
    })
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found.')
    const settings = await getSettings()
    return {
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotalPaise: invoice.subtotalPaise,
        taxPaise: invoice.taxPaise,
        totalPaise: invoice.totalPaise,
        status: invoice.status,
        orderNumber: invoice.order?.orderNumber ?? null,
        customerName: invoice.customer.name,
        lines: invoice.lines.map((l) => ({
          description: l.description,
          qty: l.qty,
          unitPricePaise: l.unitPricePaise,
          lineTotalPaise: l.lineTotalPaise,
        })),
      },
      branding: {
        companyName: settings.companyName,
        gstin: settings.gstin,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        bankDetails: settings.bankDetails,
      },
    }
  })
}

