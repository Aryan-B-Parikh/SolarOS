import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWarrantyPeriod,
  evaluateWarrantyEligibility,
  transferWarrantyToReplacement,
} from '../../src/domain/warranty.ts';

describe('Phase 5 - Warranty Engine & Public Verification (TRD 2.4, C7)', () => {
  it('calculates start and end dates for DELIVERY start basis', () => {
    const res = calculateWarrantyPeriod({
      startBasis: 'DELIVERY',
      deliveryDate: '2026-11-05',
      months: 60, // 5 years
    });

    assert.equal(res.startDate, '2026-11-05');
    assert.equal(res.endDate, '2031-11-04');
  });

  it('calculates start and end dates for COMMISSIONING start basis', () => {
    const res = calculateWarrantyPeriod({
      startBasis: 'COMMISSIONING',
      commissioningDate: '2026-11-12',
      months: 240, // 20 years
    });

    assert.equal(res.startDate, '2026-11-12');
    assert.equal(res.endDate, '2046-11-11');
  });

  it('evaluates warranty eligibility accurately on end date vs day after', () => {
    const startDate = '2026-11-05';
    const endDate = '2028-11-04';

    // On exact end date: IN_WARRANTY
    const onEnd = evaluateWarrantyEligibility({
      testDate: '2028-11-04',
      startDate,
      endDate,
      status: 'ACTIVE',
    });
    assert.equal(onEnd.verdict, 'IN_WARRANTY');
    assert.equal(onEnd.isCovered, true);

    // Day after end date: OUT_OF_WARRANTY
    const dayAfter = evaluateWarrantyEligibility({
      testDate: '2028-11-05',
      startDate,
      endDate,
      status: 'ACTIVE',
    });
    assert.equal(dayAfter.verdict, 'OUT_OF_WARRANTY');
    assert.equal(dayAfter.isCovered, false);
  });

  it('excludes voided warranties regardless of date', () => {
    const res = evaluateWarrantyEligibility({
      testDate: '2027-01-01',
      startDate: '2026-11-05',
      endDate: '2028-11-04',
      status: 'VOID',
      isVoided: true,
    });
    assert.equal(res.verdict, 'EXCLUDED');
    assert.equal(res.isCovered, false);
  });

  it('retains original end date on replacement unit warranty transfer', () => {
    const original = {
      id: 'w-orig-1',
      endDate: '2031-11-04',
      months: 60,
    };

    const transferred = transferWarrantyToReplacement(original, '2028-06-15');
    assert.equal(transferred.parentStatus, 'TRANSFERRED');
    assert.equal(transferred.replacementStartDate, '2028-06-15');
    assert.equal(transferred.replacementEndDate, '2031-11-04', 'Replacement must inherit original end date');
  });
});
