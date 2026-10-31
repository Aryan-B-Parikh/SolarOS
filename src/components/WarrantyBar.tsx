'use client';

import React from 'react';
import { formatDateIST } from '@/lib/dates';
import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface WarrantyBarProps {
  startDate: string | Date;
  endDate: string | Date;
  status?: 'ACTIVE' | 'VOID' | 'TRANSFERRED' | 'EXPIRED';
  className?: string;
}

export function WarrantyBar({ startDate, endDate, status = 'ACTIVE', className }: WarrantyBarProps) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  const totalDuration = end.getTime() - start.getTime();
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const percentElapsed = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)) : 100;
  
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isCoveredToday = daysLeft >= 0 && status === 'ACTIVE';
  const isNearExpiry = isCoveredToday && daysLeft <= 60;

  return (
    <div className={clsx('space-y-1.5 p-3 rounded-lg border bg-white shadow-xs', className)}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium">
          {isCoveredToday ? (
            isNearExpiry ? (
              <span className="flex items-center gap-1 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Expiring Soon ({daysLeft} days left)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>In Warranty ({daysLeft} days left)</span>
              </span>
            )
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
              <span>Warranty Ended</span>
            </span>
          )}
        </div>

        <span className="text-[11px] text-slate-400 font-medium">
          {status === 'ACTIVE' ? (isCoveredToday ? 'Active' : 'Expired') : status}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden relative">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            !isCoveredToday
              ? 'bg-slate-300'
              : isNearExpiry
              ? 'bg-amber-500'
              : 'bg-emerald-600'
          )}
          style={{ width: `${percentElapsed}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
        <span>Start: {formatDateIST(start)}</span>
        <span>End: {formatDateIST(end)}</span>
      </div>
    </div>
  );
}

