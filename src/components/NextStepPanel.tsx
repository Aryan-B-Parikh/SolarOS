import React from 'react';
import { ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface NextStepPanelProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  secondaryAction?: React.ReactNode;
  variant?: 'action' | 'warning' | 'success';
  className?: string;
}

export function NextStepPanel({
  title,
  description,
  actionLabel,
  onAction,
  disabled = false,
  disabledReason,
  secondaryAction,
  variant = 'action',
  className,
}: NextStepPanelProps) {
  const variantStyles = {
    action: {
      border: 'border-blue-200 bg-blue-50/50',
      icon: ArrowRight,
      iconColor: 'text-blue-600',
      btn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-blue-500',
    },
    warning: {
      border: 'border-amber-200 bg-amber-50/60',
      icon: AlertCircle,
      iconColor: 'text-amber-600',
      btn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm focus:ring-amber-500',
    },
    success: {
      border: 'border-emerald-200 bg-emerald-50/50',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm focus:ring-emerald-500',
    },
  }[variant];

  const Icon = variantStyles.icon;

  return (
    <div
      className={clsx(
        'sticky top-0 z-10 p-4 rounded-xl border shadow-sm backdrop-blur-md mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all',
        variantStyles.border,
        className
      )}
      role="region"
      aria-label="Next Step Action Panel"
    >
      <div className="flex items-start gap-3">
        <div className={clsx('p-2 rounded-lg bg-white shadow-xs shrink-0', variantStyles.iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Next Action</span>
            <span className="text-xs text-slate-300">•</span>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          </div>
          {description && <p className="text-xs text-slate-600 mt-0.5">{description}</p>}
          {disabled && disabledReason && (
            <p className="text-xs font-medium text-amber-700 mt-1 flex items-center gap-1">
              <span>⚠️</span> {disabledReason}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {secondaryAction}
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className={clsx(
              'px-4 py-2 text-sm font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all flex items-center gap-2',
              disabled
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : variantStyles.btn
            )}
          >
            <span>{actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

