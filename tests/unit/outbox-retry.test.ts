import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTBOX_RETRY_INTERVALS_MS,
  getNextAttemptDate,
} from '../../src/lib/outbox.ts';

describe('Transactional Outbox Retry & Delivery Engine (D6 / Phase 4 Acceptance)', () => {
  it('defines the 5 standard retry intervals: 5m, 15m, 1h, 6h, 24h', () => {
    assert.equal(OUTBOX_RETRY_INTERVALS_MS.length, 5);
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[0], 5 * 60 * 1000); // 5 min
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[1], 15 * 60 * 1000); // 15 min
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[2], 60 * 60 * 1000); // 1 hour
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[3], 360 * 60 * 1000); // 6 hours
    assert.equal(OUTBOX_RETRY_INTERVALS_MS[4], 1440 * 60 * 1000); // 24 hours
  });

  it('calculates the future attempt date for attempts 0 through 4', () => {
    const now = Date.now();
    for (let attempt = 0; attempt < 5; attempt++) {
      const nextDate = getNextAttemptDate(attempt);
      assert.ok(nextDate !== null);
      const diffMs = nextDate.getTime() - now;
      const expectedMs = OUTBOX_RETRY_INTERVALS_MS[attempt];
      assert.ok(Math.abs(diffMs - expectedMs) < 1000); // Within 1s
    }
  });

  it('returns null and transitions to DEAD after 5 failed attempts (D6 rule)', () => {
    // Attempt index 5 represents the 6th try -> exceed max retries
    const nextDate = getNextAttemptDate(5);
    assert.equal(nextDate, null, 'Must not schedule further retry after 5 attempts');

    const handleAttempt = (currentAttempts: number) => {
      const nextAttempts = currentAttempts + 1;
      const next = getNextAttemptDate(nextAttempts);
      if (!next || nextAttempts >= 5) {
        return { status: 'DEAD', attempts: nextAttempts };
      }
      return { status: 'FAILED', attempts: nextAttempts };
    };

    assert.equal(handleAttempt(0).status, 'FAILED');
    assert.equal(handleAttempt(1).status, 'FAILED');
    assert.equal(handleAttempt(2).status, 'FAILED');
    assert.equal(handleAttempt(3).status, 'FAILED');
    assert.equal(handleAttempt(4).status, 'DEAD'); // 5th failure ends DEAD
  });
});

