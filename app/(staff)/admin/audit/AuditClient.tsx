'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Search, ChevronDown, ChevronRight, ChevronLeft, AlertCircle, FileJson,
} from 'lucide-react';
import clsx from 'clsx';
import { apiGet } from '@/lib/client-api';
import { formatDateTimeIST } from '@/lib/dates';

interface AuditEntry {
  id: string;
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM';
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface AuditPageData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  entries: AuditEntry[];
}

const ACTOR_BADGE: Record<string, string> = {
  USER: 'bg-blue-100 text-blue-800',
  CUSTOMER: 'bg-emerald-100 text-emerald-800',
  SYSTEM: 'bg-slate-200 text-slate-700',
};

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditClient() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AuditPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entityType.trim()) params.set('entityType', entityType.trim());
      if (entityId.trim()) params.set('entityId', entityId.trim());
      if (actorId.trim()) params.set('actorId', actorId.trim());
      if (action.trim()) params.set('action', action.trim());
      params.set('page', String(page));
      const result = await apiGet<AuditPageData>(`/api/v1/admin/audit?${params.toString()}`);
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to load audit log');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, actorId, action, page]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void load();
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <form
        onSubmit={applyFilters}
        className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
      >
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500">Entity Type</label>
          <input
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. SERVICE_TICKET"
            className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500">Entity ID</label>
          <input
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(1);
            }}
            placeholder="UUID"
            className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500">Actor ID</label>
          <input
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
            placeholder="UUID"
            className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500">Action contains</label>
          <input
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. EXCLUDED"
            className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <button
          type="submit"
          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <Search className="w-3.5 h-3.5" /> Apply
        </button>
      </form>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Paginated table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
            <tr>
              <th className="px-3 py-2.5 w-8"></th>
              <th className="px-3 py-2.5">Time (IST)</th>
              <th className="px-3 py-2.5">Actor</th>
              <th className="px-3 py-2.5">Entity</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  Loading audit entries…
                </td>
              </tr>
            ) : !data || data.entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  No audit entries match the current filters.
                </td>
              </tr>
            ) : (
              data.entries.map((entry) => {
                const expanded = expandedId === entry.id;
                const hasDiff = entry.before !== null || entry.after !== null;
                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={clsx('hover:bg-slate-50 align-top', expanded && 'bg-slate-50')}
                    >
                      <td className="px-3 py-2.5">
                        {hasDiff ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : entry.id)}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="block w-3.5" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        {formatDateTimeIST(entry.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold',
                            ACTOR_BADGE[entry.actorType] || 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {entry.actorType}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                          {entry.actorId ? entry.actorId.slice(0, 8) + '…' : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-slate-800">{entry.entityType}</span>
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                          {entry.entityId.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono font-semibold text-blue-700">{entry.action}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {hasDiff ? (
                          <FileJson className="w-4 h-4 text-slate-400 inline" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="px-3 pb-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                                Before
                              </span>
                              <pre className="text-[10px] leading-relaxed bg-red-50 border border-red-100 text-red-950 rounded-lg p-3 overflow-x-auto max-h-64 font-mono">
                                {prettyJson(entry.before)}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                                After
                              </span>
                              <pre className="text-[10px] leading-relaxed bg-emerald-50 border border-emerald-100 text-emerald-950 rounded-lg p-3 overflow-x-auto max-h-64 font-mono">
                                {prettyJson(entry.after)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {data.page} of {data.totalPages} • {data.total} entr{data.total === 1 ? 'y' : 'ies'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
