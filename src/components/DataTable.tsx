'use client';

import React from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyState,
  emptyMessage = 'No records found',
  className,
}: DataTableProps<T>) {
  if (!data || data.length === 0) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <div className="py-12 px-6 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-sm text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={clsx('overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs', className)}>
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={clsx(
                  'px-4 py-3.5',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
            {onRowClick && (
              <th scope="col" className="w-10 px-2 py-3.5">
                <span className="sr-only">Action</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {data.map((row) => {
            const key = keyExtractor(row);
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                className={clsx(
                  'transition-colors hover:bg-slate-50/80',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {columns.map((col) => {
                  const content = col.render ? col.render(row) : (row as any)[col.key];
                  return (
                    <td
                      key={col.key}
                      className={clsx(
                        'px-4 py-3 text-sm whitespace-nowrap',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.className
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
                {onRowClick && (
                  <td className="px-2 py-3 text-right text-slate-400">
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

