import { AppError } from '../../lib/errors.ts';

export const LEAD_TRANSITIONS: Record<string, string[]> = {
  NEW: ['CONTACTED', 'LOST', 'DISQUALIFIED'],
  CONTACTED: ['QUALIFIED', 'LOST', 'DISQUALIFIED'],
  QUALIFIED: ['SURVEY_SCHEDULED', 'LOST', 'DISQUALIFIED'],
  SURVEY_SCHEDULED: ['SURVEY_APPROVED', 'QUALIFIED', 'LOST', 'DISQUALIFIED'],
  SURVEY_APPROVED: ['QUOTED', 'LOST', 'DISQUALIFIED'],
  QUOTED: ['WON', 'LOST', 'DISQUALIFIED'],
  WON: [],
  LOST: [],
  DISQUALIFIED: [],
};

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING_ADVANCE: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_TO_DISPATCH', 'CANCELLED'],
  READY_TO_DISPATCH: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: ['INSTALLED'],
  INSTALLED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const DISPATCH_TRANSITIONS: Record<string, string[]> = {
  PICKING: ['READY', 'CANCELLED'],
  READY: ['IN_TRANSIT', 'PICKING', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const INSTALLATION_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['IN_PROGRESS', 'ON_HOLD'],
  IN_PROGRESS: ['AWAITING_SIGNOFF', 'ON_HOLD'],
  AWAITING_SIGNOFF: ['COMPLETED', 'IN_PROGRESS'],
  ON_HOLD: ['SCHEDULED'],
  COMPLETED: [],
};

export const TICKET_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'], // Reopened returns to IN_PROGRESS
  CLOSED: ['IN_PROGRESS'], // Reopen allowed
};

/**
 * Validates whether a state transition is legal according to domain rules
 */
export function validateTransition(
  entityType: 'LEAD' | 'ORDER' | 'DISPATCH' | 'INSTALLATION' | 'TICKET',
  fromStatus: string,
  toStatus: string
): void {
  let allowedMap: Record<string, string[]>;

  switch (entityType) {
    case 'LEAD':
      allowedMap = LEAD_TRANSITIONS;
      break;
    case 'ORDER':
      allowedMap = ORDER_TRANSITIONS;
      break;
    case 'DISPATCH':
      allowedMap = DISPATCH_TRANSITIONS;
      break;
    case 'INSTALLATION':
      allowedMap = INSTALLATION_TRANSITIONS;
      break;
    case 'TICKET':
      allowedMap = TICKET_TRANSITIONS;
      break;
  }

  const allowedNext = allowedMap[fromStatus] || [];
  if (!allowedNext.includes(toStatus)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `Cannot transition ${entityType} from ${fromStatus} to ${toStatus}. Allowed: [${allowedNext.join(', ')}]`,
      409
    );
  }
}

