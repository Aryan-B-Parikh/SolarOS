import React from 'react';
import { formatDateTimeIST } from '@/lib/dates';
import { CircleDot, User, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: string | Date;
  actorName?: string;
  actorRole?: string;
  badge?: string;
  badgeColor?: 'blue' | 'green' | 'amber' | 'slate';
}

interface TimelineProps {
  events: TimelineEvent[];
  emptyMessage?: string;
  className?: string;
}

export function Timeline({ events, emptyMessage = 'No activity recorded yet', className }: TimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 bg-white rounded-lg border border-slate-200">
        {emptyMessage}
      </div>
    );
  }

  const badgeStyles = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className={clsx('relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200', className)}>
      {events.map((evt) => (
        <div key={evt.id} className="relative group">
          {/* Dot */}
          <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center shadow-xs">
            <div className="w-2 h-2 rounded-full bg-blue-600" />
          </div>

          {/* Card */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                {evt.title}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {typeof evt.timestamp === 'string' ? formatDateTimeIST(evt.timestamp) : formatDateTimeIST(evt.timestamp.toISOString())}
              </span>
            </div>

            {evt.description && (
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed mt-0.5">
                {evt.description}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3 text-slate-400" />
                {evt.actorName || 'System'}
                {evt.actorRole && <span className="text-slate-400">({evt.actorRole})</span>}
              </span>

              {evt.badge && (
                <span className={clsx('px-2 py-0.5 rounded-full border text-[10px] font-medium', badgeStyles[evt.badgeColor || 'slate'])}>
                  {evt.badge}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
