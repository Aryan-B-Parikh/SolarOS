import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateWarrantyEndDate, formatDateIST } from '../../src/lib/dates.ts';

describe('Dates Helper & Warranty Calculation', () => {
  it('calculates standard warranty end date: start + months - 1 day', () => {
    // Spec example: start 5 Nov 2026 with 24 months ends 4 Nov 2028
    const endDate = calculateWarrantyEndDate('2026-11-05', 24);
    assert.equal(endDate, '2028-11-04');
  });

  it('calculates 20-year (240 months) panel warranty', () => {
    const endDate = calculateWarrantyEndDate('2026-11-05', 240);
    assert.equal(endDate, '2046-11-04');
  });

  it('handles leap year leap day (e.g. 29 Feb 2028)', () => {
    // 29 Feb 2028 + 12 months -> 28 Feb 2029 - 1 day = 27 Feb 2029
    const endDate = calculateWarrantyEndDate('2028-02-29', 12);
    assert.equal(endDate, '2029-02-27');
  });

  it('formats dates in Indian format: 31 Oct 2026', () => {
    const date = new Date('2026-10-31T08:30:00Z');
    assert.equal(formatDateIST(date), '31 Oct 2026');
  });
});
