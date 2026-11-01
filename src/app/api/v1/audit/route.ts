// Audit log viewer (FR-9.3): every who-did-what, latest first, with optional
// filters (entity, entityId, action, date range) and 50-per-page paging.
// Actor display names resolve to the user's name; portal/customer rows show
// as "Customer", machine-triggered rows as "System". Requires audit.read.

import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'

const PAGE_SIZE = 50

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value // stored payload was not valid JSON — show it raw
  }
}

export async function GET(req: NextRequest) {
  const sp = searchParams(req)
  const entity = sp.get('entity') ?? ''
  const entityId = sp.get('entityId') ?? ''
  const action = sp.get('action') ?? ''
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  const page = Math.max(1, Number(sp.get('page') ?? '1') || 1)

  return handler(req, async () => {
    await requireCapability('audit.read')

    const where: { entityType?: string; entityId?: string; action?: string; createdAt?: { gte?: Date; lte?: Date } } = {}
    if (entity) where.entityType = entity
    if (entityId) where.entityId = entityId
    if (action) where.action = action
    const createdAt: { gte?: Date; lte?: Date } = {}
    if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`)
    if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`)
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt

    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    ])

    const userIds = [...new Set(rows.filter((r) => r.actorType === 'USER' && r.actorId).map((r) => r.actorId!))]
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : []
    const names = new Map(users.map((u) => [u.id, u.name]))

    return {
      entries: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        actorType: r.actorType,
        actorId: r.actorId,
        actorName:
          r.actorType === 'USER'
            ? (r.actorId ? names.get(r.actorId) ?? 'Unknown user' : 'Unknown user')
            : r.actorType === 'CUSTOMER' ? 'Customer' : 'System',
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        before: parseJson(r.before),
        after: parseJson(r.after),
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    }
  })
}
