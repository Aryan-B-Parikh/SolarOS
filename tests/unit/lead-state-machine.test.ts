import { describe, it, expect } from 'vitest';
import { validateLeadStateTransition } from '@/domain/state-machines/lead';
import { LeadStatus } from '@prisma/client';

describe('Lead State Machine Guards (FR-1.5, Section 4.2)', () => {
  it('allows NEW to CONTACTED and triggers SLA timer stop', () => {
    const res = validateLeadStateTransition(LeadStatus.NEW, {
      toStatus: LeadStatus.CONTACTED,
    });
    expect(res.valid).toBe(true);
    expect(res.sideEffects?.stopSlaTimer).toBe(true);
  });

  it('rejects CONTACTED to QUALIFIED if mandatory qualification fields are missing', () => {
    expect(() =>
      validateLeadStateTransition(LeadStatus.CONTACTED, {
        toStatus: LeadStatus.QUALIFIED,
        qualificationFields: {
          roofAreaSqm: 50,
          // monthly bill missing
          gridOk: true,
        },
      })
    ).toThrowError(/roof area, electricity bill/);
  });

  it('allows CONTACTED to QUALIFIED when all checklist items are filled', () => {
    const res = validateLeadStateTransition(LeadStatus.CONTACTED, {
      toStatus: LeadStatus.QUALIFIED,
      qualificationFields: {
        roofAreaSqm: 50,
        monthlyBillPaise: 300000n,
        gridOk: true,
        sanctionedLoadKw: 5,
        phase: 'SINGLE',
      },
    });
    expect(res.valid).toBe(true);
  });

  it('requires a reason when transitioning to LOST or DISQUALIFIED', () => {
    expect(() =>
      validateLeadStateTransition(LeadStatus.CONTACTED, {
        toStatus: LeadStatus.LOST,
      })
    ).toThrowError(/reason is mandatory/);

    const res = validateLeadStateTransition(LeadStatus.CONTACTED, {
      toStatus: LeadStatus.LOST,
      reason: 'Customer relocated to another state',
    });
    expect(res.valid).toBe(true);
  });

  it('prevents any transitions out of terminal WON status', () => {
    expect(() =>
      validateLeadStateTransition(LeadStatus.WON, {
        toStatus: LeadStatus.CONTACTED,
      })
    ).toThrowError(/already WON/);
  });
});
