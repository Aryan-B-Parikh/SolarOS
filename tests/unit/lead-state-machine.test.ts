import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLeadStateTransition } from '../../src/domain/state-machines/lead.ts';

const LeadStatus = {
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

describe('Lead State Machine Guards (FR-1.5, Section 4.2)', () => {
  it('allows NEW to CONTACTED and triggers SLA timer stop', () => {
    const res = validateLeadStateTransition(LeadStatus.NEW as any, {
      toStatus: LeadStatus.CONTACTED as any,
    });
    assert.equal(res.valid, true);
    assert.equal(res.sideEffects?.stopSlaTimer, true);
  });

  it('rejects CONTACTED to QUALIFIED if mandatory qualification fields are missing', () => {
    assert.throws(
      () =>
        validateLeadStateTransition(LeadStatus.CONTACTED as any, {
          toStatus: LeadStatus.QUALIFIED as any,
          qualificationFields: {
            roofAreaSqm: 50,
            gridOk: true,
          } as any,
        }),
      /roof area, electricity bill/
    );
  });

  it('allows CONTACTED to QUALIFIED when all checklist items are filled', () => {
    const res = validateLeadStateTransition(LeadStatus.CONTACTED as any, {
      toStatus: LeadStatus.QUALIFIED as any,
      qualificationFields: {
        roofAreaSqm: 50,
        monthlyBillPaise: 300000n,
        gridOk: true,
        sanctionedLoadKw: 5,
        phase: 'SINGLE',
      } as any,
    });
    assert.equal(res.valid, true);
  });

  it('requires a reason when transitioning to LOST or DISQUALIFIED', () => {
    assert.throws(
      () =>
        validateLeadStateTransition(LeadStatus.CONTACTED as any, {
          toStatus: LeadStatus.LOST as any,
        }),
      /reason is mandatory/
    );

    const res = validateLeadStateTransition(LeadStatus.CONTACTED as any, {
      toStatus: LeadStatus.LOST as any,
      reason: 'Customer relocated to another state',
    });
    assert.equal(res.valid, true);
  });

  it('prevents any transitions out of terminal WON status', () => {
    assert.throws(
      () =>
        validateLeadStateTransition(LeadStatus.WON as any, {
          toStatus: LeadStatus.CONTACTED as any,
        }),
      /already WON/
    );
  });
});
