import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTBOX_RETRY_INTERVALS_MS,
  getNextAttemptDate,
} from '../../src/lib/outbox.ts';

describe('Phase 4 - Outbox Delivery & Retry Ladder (TRD 2.8, ADR D16)', () => {
  it('enforces exact 5-interval exponential retry schedule', () => {
    assert.equal(OUTBOX_RETRY_INTERVALS_MS.length, 5);
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[0], 5 * 60 * 1000, 'Attempt 1: 5 minutes');
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[1], 15 * 60 * 1000, 'Attempt 2: 15 minutes');
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[2], 60 * 60 * 1000, 'Attempt 3: 1 hour');
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[3], 360 * 60 * 1000, 'Attempt 4: 6 hours');
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[4], 1440 * 60 * 1000, 'Attempt 5: 24 hours');
  });

  it('calculates future attempt timestamps based on attempt count', () => {
    const next1 = getNextAttemptDate(0);
    assert.ok(next1 !== null);
    const diffMin1 = Math.round((next1.getTime() - Date.now()) / (60 * 1000));
    assert.equal(diffMin1, 5);

    const next3 = getNextAttemptDate(2);
    assert.ok(next3 !== null);
    const diffMin3 = Math.round((next3.getTime() - Date.now()) / (60 * 1000));
    assert.equal(diffMin3, 60);
  });

  it('marks message as DEAD after 5 attempts', () => {
    const nextAfter5 = getNextAttemptDate(5);
    assert.equal(nextAfter5, null, 'Attempt count >= 5 must return null to trigger DEAD status');

    const nextAfter6 = getNextAttemptDate(6);
    assert.equal(nextAfter6, null);
  });
});
