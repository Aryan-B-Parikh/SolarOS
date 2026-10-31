/**
 * SunPower Ops - Deterministic Warranty Engine (TRD 2.4, FR-5.6, PRD C7, ADR D8)
 * Pure domain logic for warranty start bases, calculation of end dates, leap-year handling,
 * eligibility verdicts, and replacement transfer chains.
 */

import { calculateWarrantyEndDate } from '../lib/dates.ts';

export type WarrantyStartBasis = 'DELIVERY' | 'COMMISSIONING';

export type WarrantyStatusType = 'ACTIVE' | 'EXPIRED' | 'TRANSFERRED' | 'VOID';

export interface WarrantyCalculationInput {
  startBasis: WarrantyStartBasis;
  deliveryDate?: string | Date | null;
  commissioningDate?: string | Date | null;
  months: number;
}

export interface WarrantyCalculationResult {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  months: number;
}

export interface WarrantyEligibilityInput {
  testDate: string | Date;
  startDate: string | Date;
  endDate: string | Date;
  status: WarrantyStatusType;
  isVoided?: boolean;
}

export type WarrantyVerdict = 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'EXCLUDED';

/**
 * Calculates start and end dates based on company policy start basis.
 */
export function calculateWarrantyPeriod(input: WarrantyCalculationInput): WarrantyCalculationResult {
  let effectiveStartDate: Date;

  if (input.startBasis === 'COMMISSIONING') {
    if (!input.commissioningDate) {
      throw new Error('Commissioning date is required when warranty start basis is COMMISSIONING');
    }
    effectiveStartDate = typeof input.commissioningDate === 'string'
      ? new Date(input.commissioningDate)
      : input.commissioningDate;
  } else {
    // Default to DELIVERY
    if (!input.deliveryDate) {
      throw new Error('Delivery date is required when warranty start basis is DELIVERY');
    }
    effectiveStartDate = typeof input.deliveryDate === 'string'
      ? new Date(input.deliveryDate)
      : input.deliveryDate;
  }

  const startDateIso = effectiveStartDate.toISOString().split('T')[0];
  const endDateIso = calculateWarrantyEndDate(startDateIso, input.months);

  return {
    startDate: startDateIso,
    endDate: endDateIso,
    months: input.months,
  };
}

/**
 * Evaluates whether a unit is in warranty on a specific test date.
 * Exactly adheres to: On end date -> IN_WARRANTY; Day after end date -> OUT_OF_WARRANTY.
 */
export function evaluateWarrantyEligibility(input: WarrantyEligibilityInput): {
  verdict: WarrantyVerdict;
  remainingDays: number;
  isCovered: boolean;
} {
  if (input.isVoided || input.status === 'VOID') {
    return {
      verdict: 'EXCLUDED',
      remainingDays: 0,
      isCovered: false,
    };
  }

  const testD = typeof input.testDate === 'string' ? new Date(input.testDate) : input.testDate;
  const endD = typeof input.endDate === 'string' ? new Date(input.endDate) : input.endDate;

  // Normalize to UTC start of day for comparison
  const testUtc = Date.UTC(testD.getUTCFullYear(), testD.getUTCMonth(), testD.getUTCDate());
  const endUtc = Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), endD.getUTCDate());

  const diffMs = endUtc - testUtc;
  const remainingDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (testUtc <= endUtc) {
    return {
      verdict: 'IN_WARRANTY',
      remainingDays: Math.max(0, remainingDays),
      isCovered: true,
    };
  } else {
    return {
      verdict: 'OUT_OF_WARRANTY',
      remainingDays: 0,
      isCovered: false,
    };
  }
}

/**
 * Handles replacement unit warranty transfer (Rule C9).
 * Replacement keeps the original end date; parent warranty becomes TRANSFERRED.
 */
export function transferWarrantyToReplacement(
  originalWarranty: { id: string; endDate: string; months: number },
  replacementDate: string | Date
): {
  parentStatus: WarrantyStatusType;
  replacementStartDate: string;
  replacementEndDate: string;
} {
  const repDate = typeof replacementDate === 'string' ? replacementDate : replacementDate.toISOString().split('T')[0];

  return {
    parentStatus: 'TRANSFERRED',
    replacementStartDate: repDate,
    replacementEndDate: originalWarranty.endDate, // Inherits original end date exactly
  };
}
