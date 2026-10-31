import React from 'react';
import { formatPaise } from '@/lib/money';
import clsx from 'clsx';

interface MoneyTextProps {
  paise: bigint | number | null | undefined;
  className?: string;
  prefix?: string;
  showPaise?: boolean;
}

export function MoneyText({ paise, className, prefix = 'Rs ', showPaise = false }: MoneyTextProps) {
  if (paise === null || paise === undefined) {
    return <span className={clsx('text-slate-400 font-normal', className)}>—</span>;
  }

  const isNeg = (typeof paise === 'bigint' ? paise < 0n : paise < 0);
  const formatted = formatPaise(paise, { prefix, showPaise });

  return (
    <span className={clsx('tabular-nums font-medium', isNeg && 'text-red-700', className)}>
      {formatted}
    </span>
  );
}
