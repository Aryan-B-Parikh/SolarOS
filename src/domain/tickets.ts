/**
 * SunPower Ops - Service Ticket State Machine & SLA Engine
 * Specification Reference: TRD 2.4, Backend Schema 5.3 & 5.4, PRD C9, Phase 7
 */

import type { TicketCategory, TicketPriority } from './fault-codes.js';

export type TicketChannel = 'PHONE' | 'WHATSAPP' | 'WEB' | 'VISIT' | 'MAINTENANCE_ALERT';

export type TicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CONFIRMED'
  | 'REOPENED'
  | 'CLOSED';

export type WarrantyVerdict = 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'EXCLUDED' | 'UNKNOWN_UNIT';

export type BillingMode = 'WARRANTY' | 'CHARGEABLE';

export interface ServiceTicketRecord {
  id: string;
  ticketNumber: string;
  customerId: string;
  installationId?: string | null;
  unitId?: string | null;
  warrantyId?: string | null;
  channel: TicketChannel;
  category: TicketCategory;
  faultCode?: string | null;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  warrantyVerdict: WarrantyVerdict;
  billingMode: BillingMode;
  assignedTo?: string | null;
  slaDueAt: Date;
  resolvedAt?: Date | null;
  customerConfirmedAt?: Date | null;
  confirmationMethod?: 'PORTAL' | 'PHONE' | null;
  closedAt?: Date | null;
  resolutionNotes?: string | null;
  reopenCount: number;
}

export const SLA_HOURS_BY_PRIORITY: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 24,
  NORMAL: 48,
  LOW: 72,
};

export const ALLOWED_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['ASSIGNED', 'RESOLVED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED'],
  RESOLVED: ['CONFIRMED', 'REOPENED'],
  REOPENED: ['ASSIGNED', 'IN_PROGRESS'],
  CONFIRMED: ['CLOSED'],
  CLOSED: [], // Terminal state
};

/**
 * Calculates the SLA due timestamp based on ticket priority.
 */
export function calculateSlaDueDate(priority: TicketPriority, fromDate: Date = new Date()): Date {
  const hours = SLA_HOURS_BY_PRIORITY[priority] || 48;
  return new Date(fromDate.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Computes the initial warranty verdict and billing mode.
 */
export function determineVerdictAndBilling(
  warranty: { id: string; status: string; endDate: Date | string } | null | undefined,
  isExcluded: boolean = false,
  checkDate: Date = new Date()
): { verdict: WarrantyVerdict; billingMode: BillingMode; warrantyId: string | null } {
  if (isExcluded) {
    return { verdict: 'EXCLUDED', billingMode: 'CHARGEABLE', warrantyId: warranty?.id ?? null };
  }

  if (!warranty) {
    return { verdict: 'UNKNOWN_UNIT', billingMode: 'CHARGEABLE', warrantyId: null };
  }

  const end = typeof warranty.endDate === 'string' ? new Date(warranty.endDate) : warranty.endDate;
  const isCovered = checkDate.getTime() <= end.getTime();

  if (isCovered && warranty.status === 'ACTIVE') {
    return { verdict: 'IN_WARRANTY', billingMode: 'WARRANTY', warrantyId: warranty.id };
  }

  return { verdict: 'OUT_OF_WARRANTY', billingMode: 'CHARGEABLE', warrantyId: warranty.id };
}

/**
 * Validates whether a state transition is legal according to the specification.
 * Enforces the core database rule: CLOSED requires customer confirmation!
 */
export function validateTicketTransition(
  current: ServiceTicketRecord,
  targetStatus: TicketStatus
): { valid: boolean; reason?: string } {
  const allowed = ALLOWED_TICKET_TRANSITIONS[current.status];
  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      reason: `Illegal ticket transition: Cannot move from ${current.status} to ${targetStatus}.`,
    };
  }

  // Database CHECK constraint: status <> 'CLOSED' OR customer_confirmed_at IS NOT NULL
  if (targetStatus === 'CLOSED' && !current.customerConfirmedAt) {
    return {
      valid: false,
      reason: 'Rule Violation: A ticket cannot be CLOSED without customer confirmation (customer_confirmed_at).',
    };
  }

  // Database CHECK constraint: warranty_verdict <> 'IN_WARRANTY' OR warranty_id IS NOT NULL
  if (current.warrantyVerdict === 'IN_WARRANTY' && !current.warrantyId) {
    return {
      valid: false,
      reason: 'Rule Violation: An IN_WARRANTY ticket must be linked to a valid warranty row (warranty_id).',
    };
  }

  return { valid: true };
}

