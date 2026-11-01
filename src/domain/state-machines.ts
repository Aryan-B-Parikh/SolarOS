// State machines (App Flow 4.2). Every status change goes through a transition
// function that checks the allowed-transition map; anything else is INVALID_TRANSITION.

import { AppError } from '@/lib/errors'

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'SURVEY_SCHEDULED' | 'SURVEY_APPROVED' | 'QUOTED' | 'WON' | 'LOST' | 'DISQUALIFIED'
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED'
export type OrderStatus = 'PENDING_ADVANCE' | 'CONFIRMED' | 'READY_TO_DISPATCH' | 'DISPATCHED' | 'DELIVERED' | 'INSTALLED' | 'CLOSED' | 'CANCELLED'
export type DispatchStatus = 'PICKING' | 'READY' | 'IN_TRANSIT' | 'DELIVERED'
export type InstallationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'AWAITING_SIGNOFF' | 'COMPLETED' | 'ON_HOLD'
export type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type UnitStatus = 'IN_STOCK' | 'PICKED' | 'DISPATCHED' | 'DELIVERED' | 'INSTALLED' | 'RMA' | 'REPLACED' | 'SCRAPPED'
export type SurveyStatus = 'SCHEDULED' | 'COMPLETED' | 'APPROVED' | 'REJECTED'

export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'LOST', 'DISQUALIFIED'],
  CONTACTED: ['QUALIFIED', 'LOST', 'DISQUALIFIED'],
  QUALIFIED: ['SURVEY_SCHEDULED', 'LOST', 'DISQUALIFIED'],
  SURVEY_SCHEDULED: ['SURVEY_APPROVED', 'QUALIFIED', 'LOST', 'DISQUALIFIED'],
  SURVEY_APPROVED: ['QUOTED', 'LOST', 'DISQUALIFIED'],
  QUOTED: ['WON', 'LOST', 'DISQUALIFIED'], // customer rejection keeps the lead QUOTED (FR-10.2)
  WON: [],
  LOST: [],
  DISQUALIFIED: [],
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ADVANCE: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_TO_DISPATCH', 'CANCELLED'],
  READY_TO_DISPATCH: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: ['INSTALLED'],
  INSTALLED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

export const DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  PICKING: ['READY'],
  READY: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
}

export const INSTALLATION_TRANSITIONS: Record<InstallationStatus, InstallationStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'ON_HOLD'],
  IN_PROGRESS: ['AWAITING_SIGNOFF', 'ON_HOLD'],
  AWAITING_SIGNOFF: ['COMPLETED'],
  ON_HOLD: ['SCHEDULED'],
  COMPLETED: [],
}

export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'], // reopen when the customer says not fixed
  CLOSED: [],
}

export const SURVEY_TRANSITIONS: Record<SurveyStatus, SurveyStatus[]> = {
  SCHEDULED: ['COMPLETED'],
  COMPLETED: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
}

export function assertTransition<S extends string>(map: Record<S, S[]>, from: S, to: S, what: string): void {
  const allowed = map[from] ?? []
  if (!allowed.includes(to)) {
    throw new AppError('INVALID_TRANSITION', `${what} cannot move from ${from.replace(/_/g, ' ').toLowerCase()} to ${to.replace(/_/g, ' ').toLowerCase()}.`)
  }
}

// Customer-visible eight-stage tracker (App Flow 4.1)
export type CustomerStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function customerStage(
  leadStatus: LeadStatus | null,
  order: { status: OrderStatus | null; paidPaise: number; advanceRequiredPaise: number } | null,
  hasTickets: boolean
): { stage: CustomerStage; message: string } {
  const orderStatus = order?.status ?? null
  if (orderStatus === 'INSTALLED' || orderStatus === 'CLOSED') {
    return hasTickets
      ? { stage: 8, message: 'Your system is installed. Track warranty and service requests here.' }
      : { stage: 7, message: 'Installation complete. View your photos, installed equipment and certificate below.' }
  }
  if (orderStatus) {
    if (orderStatus === 'DISPATCHED' || orderStatus === 'READY_TO_DISPATCH') {
      return { stage: 5, message: 'Your equipment is being prepared and will be on its way shortly.' }
    }
    if (orderStatus === 'DELIVERED') return { stage: 6, message: 'Equipment delivered. Your installation is scheduled.' }
    if (orderStatus === 'CANCELLED') return { stage: 4, message: 'Your order has been cancelled. Please contact our team if you have any questions.' }
    if (orderStatus === 'PENDING_ADVANCE') {
      // the order exists but no (full) advance has been recorded — never claim
      // "payment received" here; the exact amount is shown in Payments below.
      return (order?.paidPaise ?? 0) > 0
        ? { stage: 4, message: 'We have received part of your payment. Our team will call you to complete the advance, and then we will confirm your installation date.' }
        : { stage: 4, message: 'Your order is confirmed and the advance payment is pending — our team will call you to collect it. The amount is shown under Payments below.' }
    }
    return { stage: 4, message: 'Payment received and your order is confirmed. We will confirm your installation date next.' }
  }
  switch (leadStatus) {
    case 'SURVEY_APPROVED':
      return { stage: 2, message: 'Survey approved. Your quotation is being prepared.' }
    case 'QUOTED':
      return { stage: 3, message: 'Your quotation is ready. Open it below to accept or reject.' }
    case 'WON':
      return { stage: 4, message: 'Thank you for accepting the quotation. Your order is being prepared.' }
    case 'SURVEY_SCHEDULED':
      return { stage: 2, message: 'Your site survey is scheduled. The surveyor will call before visiting.' }
    case 'QUALIFIED':
      return { stage: 2, message: 'We are scheduling your site survey.' }
    default:
      return { stage: 1, message: 'Request received. Our sales team will contact you within 4 business hours.' }
  }
}
