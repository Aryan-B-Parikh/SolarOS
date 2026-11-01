import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { can, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    const user = await requireUser()
    // Settings editors may also see inactive templates (they can re-activate
    // them there); everyone else only sees the active catalogue.
    const all = searchParams(req).get('all') === '1' && can(user, 'templates.write')
    const templates = await db.systemTemplate.findMany({
      where: all ? undefined : { isActive: true },
      include: { bomLines: { include: { product: true } }, panelProduct: true },
      orderBy: [{ systemType: 'asc' }, { capacityKw: 'asc' }],
    })
    return { templates }
  })
}
