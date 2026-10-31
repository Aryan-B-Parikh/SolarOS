import { AppError } from '../../lib/errors.ts';

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  SURVEY_SCHEDULED: 'SURVEY_SCHEDULED',
  SURVEY_APPROVED: 'SURVEY_APPROVED',
  QUOTED: 'QUOTED',
  WON: 'WON',
  LOST: 'LOST',
  DISQUALIFIED: 'DISQUALIFIED',
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export interface LeadTransitionContext {
  toStatus: LeadStatus;
  reason?: string;
  qualificationFields?: {
    roofAreaSqm?: number | null;
    monthlyBillPaise?: bigint | null;
    monthlyUnits?: number | null;
    gridOk?: boolean | null;
    sanctionedLoadKw?: number | null;
    phase?: string | null;
  };
  surveyCompleted?: boolean;
  surveyPhotosCount?: number;
  quoteTotalPaise?: bigint | null;
  quoteAccepted?: boolean;
}

export function validateLeadStateTransition(
  currentStatus: LeadStatus,
  context: LeadTransitionContext
): { valid: boolean; sideEffects?: { stopSlaTimer?: boolean; markWon?: boolean } } {
  const { toStatus, reason, qualificationFields } = context;

  // 1. Terminal / Closed state protection
  if (currentStatus === LeadStatus.WON) {
    throw new AppError('INVALID_TRANSITION', 'Lead is already WON and cannot transition further', 409);
  }

  // 2. Reason required for Lost / Disqualified
  if (toStatus === LeadStatus.LOST || toStatus === LeadStatus.DISQUALIFIED) {
    if (!reason || reason.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', `A reason is mandatory when marking a lead as ${toStatus}`, 422);
    }
    return { valid: true };
  }

  // 3. Status Transition Matrix & Guards
  switch (currentStatus) {
    case LeadStatus.NEW:
      if (toStatus === LeadStatus.CONTACTED) {
        return { valid: true, sideEffects: { stopSlaTimer: true } };
      }
      break;

    case LeadStatus.CONTACTED:
      if (toStatus === LeadStatus.QUALIFIED) {
        // Guard: roof area, monthly bill/units, grid fields
        if (
          !qualificationFields ||
          !qualificationFields.roofAreaSqm ||
          (!qualificationFields.monthlyBillPaise && !qualificationFields.monthlyUnits) ||
          qualificationFields.gridOk === null ||
          qualificationFields.gridOk === undefined ||
          !qualificationFields.sanctionedLoadKw ||
          !qualificationFields.phase
        ) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Cannot qualify lead: roof area, electricity bill/units, grid suitability, sanctioned load, and phase are required',
            422
          );
        }
        return { valid: true };
      }
      break;

    case LeadStatus.QUALIFIED:
      if (toStatus === LeadStatus.SURVEY_SCHEDULED) {
        return { valid: true };
      }
      break;

    case LeadStatus.SURVEY_SCHEDULED:
      if (toStatus === LeadStatus.SURVEY_APPROVED) {
        if (!context.surveyCompleted) {
          throw new AppError('SURVEY_NOT_APPROVED', 'Cannot approve survey before survey is completed', 422);
        }
        return { valid: true };
      }
      if (toStatus === LeadStatus.QUALIFIED) {
        // Manager rejected survey; can re-schedule
        if (!reason) {
          throw new AppError('VALIDATION_FAILED', 'Rejection reason is required when returning survey to QUALIFIED', 422);
        }
        return { valid: true };
      }
      break;

    case LeadStatus.SURVEY_APPROVED:
      if (toStatus === LeadStatus.QUOTED) {
        if (!context.quoteTotalPaise || context.quoteTotalPaise <= 0n) {
          throw new AppError('VALIDATION_FAILED', 'Quote total must be greater than zero to move to QUOTED', 422);
        }
        return { valid: true };
      }
      break;

    case LeadStatus.QUOTED:
      if (toStatus === LeadStatus.WON) {
        if (!context.quoteAccepted) {
          throw new AppError('VALIDATION_FAILED', 'Lead can only be marked WON after the quote is accepted', 422);
        }
        return { valid: true, sideEffects: { markWon: true } };
      }
      break;
  }

  throw new AppError(
    'INVALID_TRANSITION',
    `Invalid lead transition from ${currentStatus} to ${toStatus}`,
    409
  );
}
