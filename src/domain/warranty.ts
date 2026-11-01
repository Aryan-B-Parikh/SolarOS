// Warranty engine (TRD 2.4, D5). Dates are calendar dates in IST.
// Start = the event named by the product's start basis (delivery by default).
// End = start + product months - 1 day (5 Nov 2026 + 24m = 4 Nov 2028).

import { warrantyEnd, daysBetween, istToday } from '@/lib/dates'

export type WarrantyVerdict = 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'EXCLUDED' | 'UNKNOWN_UNIT'
export type BillingMode = 'WARRANTY' | 'CHARGEABLE'

export interface WarrantyLike {
  id: string
  startDate: string
  endDate: string
  status: string // ACTIVE, VOID, TRANSFERRED
}

/** End date for a term starting on startDate (calendar months, clamped). */
export function computeEndDate(startDate: string, months: number): string {
  return warrantyEnd(startDate, months)
}

/** Days left in a warranty as of today (negative if past). */
export function daysLeft(w: { endDate: string; status: string }): number {
  return daysBetween(istToday(), w.endDate)
}

/** Eligibility on a date (TRD 2.4). */
export function eligibility(
  unit: { id: string } | null,
  warranty: WarrantyLike | null
): { verdict: WarrantyVerdict; billingMode: BillingMode; warrantyId?: string } {
  if (!unit) return { verdict: 'UNKNOWN_UNIT', billingMode: 'CHARGEABLE' }
  if (!warranty || warranty.status === 'TRANSFERRED') return { verdict: 'OUT_OF_WARRANTY', billingMode: 'CHARGEABLE' }
  if (warranty.status === 'VOID') return { verdict: 'EXCLUDED', billingMode: 'CHARGEABLE' }
  const today = istToday()
  const covers = warranty.startDate <= today && today <= warranty.endDate
  return covers
    ? { verdict: 'IN_WARRANTY', billingMode: 'WARRANTY', warrantyId: warranty.id }
    : { verdict: 'OUT_OF_WARRANTY', billingMode: 'CHARGEABLE' }
}

/** Replacement policy (Q3): the successor inherits the original end date. */
export function replacementEndDate(original: { endDate: string }): string {
  return original.endDate
}

/** Whether a warranty covers a given date (used for tests and reminders). */
export function coversDate(w: { startDate: string; endDate: string; status: string }, date: string): boolean {
  return w.status === 'ACTIVE' && w.startDate <= date && date <= w.endDate
}
