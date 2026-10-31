'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  previousValue?: string;
  changePercent?: number | null;
  changeLabel?: string;
  isCurrency?: boolean;
  alert?: boolean;
  helpText?: string;
  className?: string;
}

export function KpiTile({
  label,
  value,
  previousValue,
  changePercent,
  changeLabel = 'vs last period',
  alert = false,
  helpText,
  className,
}: KpiTileProps) {
  const isPositive = changePercent !== null && changePercent !== undefined && changePercent > 0;
  const isNegative = changePercent !== null && changePercent !== undefined && changePercent < 0;

  return (
    <div
      className={clsx(
        'p-5 rounded-xl border bg-white shadow-xs flex flex-col justify-between transition-all hover:shadow-sm',
        alert ? 'border-red-300 bg-red-50/20' : 'border-slate-200',
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
          {alert && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-red-100 text-red-700">
              Alert
            </span>
          )}
        </div>

        <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
          {value}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        {changePercent !== null && changePercent !== undefined ? (
          <div className="flex items-center gap-1 font-medium">
            {isPositive && (
              <span className="inline-flex items-center text-emerald-600 gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                +{changePercent}%
              </span>
            )}
            {isNegative && (
              <span className="inline-flex items-center text-red-600 gap-0.5">
                <TrendingDown className="w-3.5 h-3.5" />
                {changePercent}%
              </span>
            )}
            {!isPositive && !isNegative && (
              <span className="inline-flex items-center text-slate-500 gap-0.5">
                <Minus className="w-3.5 h-3.5" />
                0%
              </span>
            )}
            <span className="text-slate-400 font-normal">{changeLabel}</span>
          </div>
        ) : previousValue ? (
          <span className="text-slate-500">Prev: {previousValue}</span>
        ) : helpText ? (
          <span className="text-slate-400">{helpText}</span>
        ) : (
          <span className="text-slate-400">Current active metric</span>
        )}
      </div>
    </div>
  );
}

