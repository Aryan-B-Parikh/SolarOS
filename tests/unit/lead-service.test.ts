import { describe, it, expect } from 'vitest';
import { normalizePhone, isAddressDuplicate } from '@/domain/duplicates';
import { validateLeadStateTransition } from '@/domain/state-machines/lead';
import { LeadStatus } from '@prisma/client';

describe('Member 1 - Phase 1 Domain Logic & Duplicate Detection', () => {
  it('normalizes customer phone numbers to standard format', () => {
    expect(normalizePhone('9825000001')).toBe('+919825000001');
    expect(normalizePhone('+919825000001')).toBe('+919825000001');
  });

  it('detects address duplicate when addresses match closely in same pincode', () => {
    const addr1 = '14 Shantiniketan Society, Satellite Road';
    const addr2 = '14, Shantiniketan Soc., Satellite Rd.';
    const pincode = '380015';

    const result = isAddressDuplicate(addr1, pincode, addr2, pincode, 0.6);
    expect(result.isDuplicate).toBe(true);
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('does NOT flag address duplicate if pincodes differ', () => {
    const addr1 = '14 Shantiniketan Society, Satellite Road';
    const addr2 = '14 Shantiniketan Society, Satellite Road';

    const result = isAddressDuplicate(addr1, '380015', addr2, '380054');
    expect(result.isDuplicate).toBe(false);
    expect(result.score).toBe(0);
  });

  it('enforces lead lifecycle transitions and guards', () => {
    // NEW -> CONTACTED stops SLA timer
    const step1 = validateLeadStateTransition(LeadStatus.NEW, {
      toStatus: LeadStatus.CONTACTED,
    });
    expect(step1.valid).toBe(true);
    expect(step1.sideEffects?.stopSlaTimer).toBe(true);

    // CONTACTED -> QUALIFIED requires checklist fields
    expect(() =>
      validateLeadStateTransition(LeadStatus.CONTACTED, {
        toStatus: LeadStatus.QUALIFIED,
        qualificationFields: {
          roofAreaSqm: 40,
          // Missing bill and load
        },
      })
    ).toThrow();

    // CONTACTED -> QUALIFIED with all fields passes
    const step2 = validateLeadStateTransition(LeadStatus.CONTACTED, {
      toStatus: LeadStatus.QUALIFIED,
      qualificationFields: {
        roofAreaSqm: 40,
        monthlyBillPaise: 350000n,
        gridOk: true,
        sanctionedLoadKw: 4,
        phase: 'SINGLE',
      },
    });
    expect(step2.valid).toBe(true);
  });

  it('refuses invalid jump from NEW to QUOTED with 409 conflict', () => {
    expect(() =>
      validateLeadStateTransition(LeadStatus.NEW, {
        toStatus: LeadStatus.QUOTED,
      })
    ).toThrowError(/Invalid lead transition/);
  });

  it('mandates a reason when closing lead as LOST or DISQUALIFIED', () => {
    expect(() =>
      validateLeadStateTransition(LeadStatus.CONTACTED, {
        toStatus: LeadStatus.LOST,
      })
    ).toThrowError(/reason is mandatory/);

    const stepLost = validateLeadStateTransition(LeadStatus.CONTACTED, {
      toStatus: LeadStatus.LOST,
      reason: 'Customer opted out due to budget',
    });
    expect(stepLost.valid).toBe(true);
  });
});
