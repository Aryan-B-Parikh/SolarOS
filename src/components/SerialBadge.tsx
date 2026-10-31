import React, { useState } from 'react';
import { QrCode, Copy, Check } from 'lucide-react';
import clsx from 'clsx';

interface SerialBadgeProps {
  serial: string;
  qrCode?: string;
  productName?: string;
  className?: string;
}

export function SerialBadge({ serial, qrCode, productName, className }: SerialBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(serial);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono font-medium text-slate-800', className)}>
      <QrCode className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
      <span className="tracking-tight">{serial}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="ml-1 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
        title="Copy Serial Number"
        aria-label={`Copy serial number ${serial}`}
      >
        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

