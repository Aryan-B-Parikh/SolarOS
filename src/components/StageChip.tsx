import React from 'react';
import { 
  Sparkles, PhoneCall, CheckCircle2, Calendar, FileCheck, 
  FileText, Trophy, XCircle, AlertCircle, Clock, Truck, 
  Wrench, CheckCheck, Ban, ShieldCheck 
} from 'lucide-react';
import clsx from 'clsx';

export type StageType = 
  // Lead stages
  | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'SURVEY_SCHEDULED' | 'SURVEY_APPROVED' | 'QUOTED' | 'WON' | 'LOST' | 'DISQUALIFIED'
  // Order stages
  | 'PENDING_ADVANCE' | 'CONFIRMED' | 'READY_TO_DISPATCH' | 'DISPATCHED' | 'DELIVERED' | 'INSTALLED' | 'CLOSED' | 'CANCELLED'
  // Ticket stages
  | 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED'
  // General
  | 'ACTIVE' | 'EXPIRED' | 'VOID' | 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

interface StageChipProps {
  stage: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StageChip({ stage, size = 'sm', className }: StageChipProps) {
  const norm = (stage || '').toUpperCase();

  const getStyleAndIcon = () => {
    switch (norm) {
      case 'NEW':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: Sparkles,
          label: 'New Lead'
        };
      case 'CONTACTED':
        return {
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: PhoneCall,
          label: 'Contacted'
        };
      case 'QUALIFIED':
        return {
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          icon: CheckCircle2,
          label: 'Qualified'
        };
      case 'SURVEY_SCHEDULED':
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: Calendar,
          label: 'Survey Scheduled'
        };
      case 'SURVEY_APPROVED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: FileCheck,
          label: 'Survey Approved'
        };
      case 'QUOTED':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: FileText,
          label: 'Quoted'
        };
      case 'WON':
      case 'ACCEPTED':
      case 'INSTALLED':
      case 'DELIVERED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold',
          icon: Trophy,
          label: norm.replace('_', ' ')
        };
      case 'LOST':
      case 'DISQUALIFIED':
      case 'CANCELLED':
      case 'VOID':
      case 'REJECTED':
        return {
          bg: 'bg-red-50 text-red-700 border-red-200',
          icon: XCircle,
          label: norm.replace('_', ' ')
        };
      case 'PENDING_ADVANCE':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: Clock,
          label: 'Pending Advance'
        };
      case 'CONFIRMED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: CheckCheck,
          label: 'Confirmed'
        };
      case 'READY_TO_DISPATCH':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: Clock,
          label: 'Ready to Dispatch'
        };
      case 'DISPATCHED':
        return {
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: Truck,
          label: 'In Transit'
        };
      case 'IN_PROGRESS':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: Wrench,
          label: 'In Progress'
        };
      case 'CLOSED':
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300',
          icon: ShieldCheck,
          label: 'Closed'
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: AlertCircle,
          label: norm.replace('_', ' ')
        };
    }
  };

  const { bg, icon: Icon, label } = getStyleAndIcon();

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        bg,
        className
      )}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <Icon className={clsx(size === 'sm' ? 'w-3 h-3' : 'w-4 h-4', 'shrink-0')} aria-hidden="true" />
      <span className="capitalize">{label}</span>
    </span>
  );
}
