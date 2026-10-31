import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWarrantyEndDate,
  formatDateIST,
  addBusinessHours,
  businessHoursElapsedSince,
  LEAD_SLA_BUSINESS_HOURS,
} from '../../src/lib/dates.ts';

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

describe('Business Hours Helpers (FR-1.6 / AUTO-8, 09:00-18:00 IST Mon-Sat)', () => {
  it('adds business hours across a weekend: Fri 17:00 IST + 4h => Sat 12:00 IST', () => {
    // Friday 30 Oct 2026, 17:00 IST == 2026-10-30T11:30:00Z
    // 1h left on Friday, then 3h on Saturday from 09:00 => Sat 30 Oct? No:
    // Sat is 31 Oct 2026, 12:00 IST == 2026-10-31T06:30:00Z.
    const from = new Date('2026-10-30T11:30:00.000Z');
    const due = addBusinessHours(from, 4);
    assert.equal(due.toISOString(), '2026-10-31T06:30:00.000Z');
  });

  it('skips Sunday entirely: Sat 17:00 IST + 2h => Mon 10:00 IST', () => {
    // Saturday 31 Oct 2026 17:00 IST (1h left in window) + Sunday (closed)
    // + 1h from Monday 09:00 => Monday 2 Nov 2026, 10:00 IST == 2026-11-02T04:30:00Z.
    const from = new Date('2026-10-31T11:30:00.000Z');
    const due = addBusinessHours(from, 2);
    assert.equal(due.toISOString(), '2026-11-02T04:30:00.000Z');
  });

  it('starts from opening time when the clock is before 09:00 IST', () => {
    // Monday 2 Nov 2026, 07:00 IST == 2026-11-02T01:30:00Z; +1h => 10:00 IST.
    const from = new Date('2026-11-02T01:30:00.000Z');
    const due = addBusinessHours(from, 1);
    assert.equal(due.toISOString(), '2026-11-02T04:30:00.000Z');
  });

  it('rolls to the next workday when called after closing time', () => {
    // Saturday 31 Oct 2026, 19:00 IST (after close) + 1h => Monday 10:00 IST.
    const from = new Date('2026-10-31T13:30:00.000Z');
    const due = addBusinessHours(from, 1);
    assert.equal(due.toISOString(), '2026-11-02T04:30:00.000Z');
  });

  it('returns the input unchanged for zero or negative hours', () => {
    const from = new Date('2026-11-02T04:30:00.000Z');
    assert.equal(addBusinessHours(from, 0).toISOString(), from.toISOString());
  });

  it('counts only in-window hours: Fri 17:00 -> Mon 10:00 IST is 11 business hours', () => {
    // Fri 17:00-18:00 = 1h; Sat 09:00-18:00 = 9h; Sun = 0; Mon 09:00-10:00 = 1h.
    const from = new Date('2026-10-30T11:30:00.000Z'); // Fri 17:00 IST
    const now = new Date('2026-11-02T04:30:00.000Z'); // Mon 10:00 IST
    assert.equal(businessHoursElapsedSince(from, now), 11);
  });

  it('returns 0 business hours when no window has opened yet', () => {
    // Sunday 11:00 IST, created 1 clock hour earlier on Sunday.
    const from = new Date('2026-11-01T05:00:00.000Z'); // Sun 10:30 IST
    const now = new Date('2026-11-01T05:30:00.000Z'); // Sun 11:00 IST
    assert.equal(businessHoursElapsedSince(from, now), 0);
  });

  it('breaches the 4 business-hour lead SLA only after 4 in-window hours', () => {
    assert.equal(LEAD_SLA_BUSINESS_HOURS, 4);
    // Lead created Fri 16:30 IST; by Sat 10:30 IST only 3 business hours
    // have elapsed (1.5h Fri 16:30-18:00 + 1.5h Sat 09:00-10:30).
    const created = new Date('2026-10-30T11:00:00.000Z'); // Fri 16:30 IST
    const before = new Date('2026-10-31T05:00:00.000Z'); // Sat 10:30 IST
    assert.ok(businessHoursElapsedSince(created, before) < LEAD_SLA_BUSINESS_HOURS);
    // By Sat 12:00 IST (1.5h Fri + 3h Sat = 4.5 business hours) the SLA is breached.
    const after = new Date('2026-10-31T06:30:00.000Z'); // Sat 12:00 IST
    assert.ok(businessHoursElapsedSince(created, after) >= LEAD_SLA_BUSINESS_HOURS);
  });
});
