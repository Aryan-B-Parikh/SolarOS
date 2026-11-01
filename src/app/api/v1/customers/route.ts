import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = searchParams(req).get('q') ?? ''
  return handler(req, async () => {
    await requireCapability('leads.read')
    const digits = q.replace(/\D/g, '')
    const customers = await db.customer.findMany({
      where: q ? { OR: [{ name: { contains: q } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []), { customerNumber: { contains: q.toUpperCase() } }] } : undefined,
      include: { leads: true, orders: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { customers }
  })
}
