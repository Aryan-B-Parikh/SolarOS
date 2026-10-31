import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isAddressDuplicate } from '../../src/domain/duplicates.ts';
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

describe('Member 1 - Phase 1 Domain Logic & Duplicate Detection', () => {
  it('normalizes customer phone numbers to standard format', () => {
    assert.equal(normalizePhone('9825000001'), '+919825000001');
    assert.equal(normalizePhone('+919825000001'), '+919825000001');
  });

  it('detects address duplicate when addresses match closely in same pincode', () => {
    const addr1 = '14 Shantiniketan Society, Satellite Road';
    const addr2 = '14, Shantiniketan Soc., Satellite Rd.';
    const pincode = '380015';

    const result = isAddressDuplicate(addr1, pincode, addr2, pincode, 0.6);
    assert.equal(result.isDuplicate, true);
    assert.ok(result.score > 0.6);
  });

  it('does NOT flag address duplicate if pincodes differ', () => {
    const addr1 = '14 Shantiniketan Society, Satellite Road';
    const addr2 = '14 Shantiniketan Society, Satellite Road';

    const result = isAddressDuplicate(addr1, '380015', addr2, '380054');
    assert.equal(result.isDuplicate, false);
    assert.equal(result.score, 0);
  });

  it('enforces lead lifecycle transitions and guards', () => {
    // NEW -> CONTACTED stops SLA timer
    const step1 = validateLeadStateTransition(LeadStatus.NEW as any, {
      toStatus: LeadStatus.CONTACTED as any,
    });
    assert.equal(step1.valid, true);
    assert.equal(step1.sideEffects?.stopSlaTimer, true);

    // CONTACTED -> QUALIFIED requires checklist fields
    assert.throws(() =>
      validateLeadStateTransition(LeadStatus.CONTACTED as any, {
        toStatus: LeadStatus.QUALIFIED as any,
        qualificationFields: {
          roofAreaSqm: 40,
        } as any,
      })
    );

    // CONTACTED -> QUALIFIED with all fields passes
    const step2 = validateLeadStateTransition(LeadStatus.CONTACTED as any, {
      toStatus: LeadStatus.QUALIFIED as any,
      qualificationFields: {
        roofAreaSqm: 40,
        monthlyBillPaise: 350000n,
        gridOk: true,
        sanctionedLoadKw: 4,
        phase: 'SINGLE',
      } as any,
    });
    assert.equal(step2.valid, true);
  });

  it('refuses invalid jump from NEW to QUOTED with 409 conflict', () => {
    assert.throws(
      () =>
        validateLeadStateTransition(LeadStatus.NEW as any, {
          toStatus: LeadStatus.QUOTED as any,
        }),
      /Invalid lead transition/
    );
  });

  it('mandates a reason when closing lead as LOST or DISQUALIFIED', () => {
    assert.throws(
      () =>
        validateLeadStateTransition(LeadStatus.CONTACTED as any, {
          toStatus: LeadStatus.LOST as any,
        }),
      /reason is mandatory/
    );

    const stepLost = validateLeadStateTransition(LeadStatus.CONTACTED as any, {
      toStatus: LeadStatus.LOST as any,
      reason: 'Customer opted out due to budget',
    });
    assert.equal(stepLost.valid, true);
  });
});
