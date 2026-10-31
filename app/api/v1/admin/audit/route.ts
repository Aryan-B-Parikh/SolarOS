import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * FR-9.3 — audit log viewer API (DIRECTOR only).
 * Filters: entityType?, entityId?, actorId?; paginated 50/page, newest first.
 */
const AuditQuerySchema = z.object({
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const GET = createApiHandler(
  {
    querySchema: AuditQuerySchema,
    allowedRoles: ['DIRECTOR'],
  },
  async ({ query }) => {
    const where = {
      entity_type: query.entityType || undefined,
      entity_id: query.entityId || undefined,
      actor_id: query.actorId || undefined,
      action: query.action ? { contains: query.action, mode: 'insensitive' as const } : undefined,
    };

    const [total, entries] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      entries: entries.map((e) => ({
        id: e.id,
        actorType: e.actor_type,
        actorId: e.actor_id,
        entityType: e.entity_type,
        entityId: e.entity_id,
        action: e.action,
        before: e.before ?? null,
        after: e.after ?? null,
        createdAt: e.created_at.toISOString(),
      })),
    });
  }
);
