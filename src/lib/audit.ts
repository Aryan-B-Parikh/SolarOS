import { prisma } from './db';

export type ActorType = 'USER' | 'CUSTOMER' | 'SYSTEM';

export interface AuditLogEntry {
  actorType: ActorType;
  actorId?: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: any;
  after?: any;
  requestId?: string;
}

/**
 * Appends a record to the audit_log table inside the active transaction
 */
export async function recordAudit(entry: AuditLogEntry, tx?: any) {
  const db = tx || prisma;
  return db.auditLog.create({
    data: {
      actor_type: entry.actorType,
      actor_id: entry.actorId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      before: entry.before ? JSON.parse(JSON.stringify(entry.before)) : null,
      after: entry.after ? JSON.parse(JSON.stringify(entry.after)) : null,
      request_id: entry.requestId,
    },
  });
}

