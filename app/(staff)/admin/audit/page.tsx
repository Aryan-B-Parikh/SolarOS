import React from 'react';
import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import AuditClient from './AuditClient';

export const dynamic = 'force-dynamic';

/**
 * FR-9.3 — audit log viewer (DIRECTOR only).
 * Reads the AuditLog table (actor_type, actor_id, entity_type, entity_id,
 * action, before, after, created_at) with filters and 50/page pagination
 * via GET /api/v1/admin/audit.
 */
export default async function AdminAuditPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'DIRECTOR') {
    return (
      <div className="max-w-xl mx-auto bg-white border border-red-200 rounded-xl p-8 text-center">
        <h1 className="text-lg font-bold text-red-700">Access Denied</h1>
        <p className="text-xs text-slate-500 mt-2">
          The audit log viewer is restricted to DIRECTOR accounts (FR-9.3).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <ScrollText className="w-7 h-7 text-blue-600" />
          <span>Audit Log (FR-9.3)</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Immutable trail of every state change across the system. Filter by entity or actor, and expand a
          row to inspect the before/after JSON diff.
        </p>
      </div>

      <AuditClient />
    </div>
  );
}
