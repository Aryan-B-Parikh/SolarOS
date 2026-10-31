import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransition } from '../../src/domain/state-machines/transitions.ts';

describe('Domain State Machines', () => {
  it('allows valid lead lifecycle transitions', () => {
    assert.doesNotThrow(() => validateTransition('LEAD', 'NEW', 'CONTACTED'));
    assert.doesNotThrow(() => validateTransition('LEAD', 'CONTACTED', 'QUALIFIED'));
    assert.doesNotThrow(() => validateTransition('LEAD', 'QUALIFIED', 'SURVEY_SCHEDULED'));
    assert.doesNotThrow(() => validateTransition('LEAD', 'SURVEY_SCHEDULED', 'SURVEY_APPROVED'));
    assert.doesNotThrow(() => validateTransition('LEAD', 'SURVEY_APPROVED', 'QUOTED'));
    assert.doesNotThrow(() => validateTransition('LEAD', 'QUOTED', 'WON'));
  });

  it('rejects invalid lead transitions with 409 conflict', () => {
    assert.throws(() => validateTransition('LEAD', 'NEW', 'QUOTED'), /Cannot transition LEAD from NEW to QUOTED/);
    assert.throws(() => validateTransition('LEAD', 'WON', 'CONTACTED'), (err: any) => err.code === 'INVALID_TRANSITION');
  });

  it('enforces order lifecycle transitions', () => {
    assert.doesNotThrow(() => validateTransition('ORDER', 'PENDING_ADVANCE', 'CONFIRMED'));
    assert.doesNotThrow(() => validateTransition('ORDER', 'CONFIRMED', 'READY_TO_DISPATCH'));
    assert.doesNotThrow(() => validateTransition('ORDER', 'READY_TO_DISPATCH', 'DISPATCHED'));
    assert.doesNotThrow(() => validateTransition('ORDER', 'DISPATCHED', 'DELIVERED'));
    assert.doesNotThrow(() => validateTransition('ORDER', 'DELIVERED', 'INSTALLED'));
    assert.doesNotThrow(() => validateTransition('ORDER', 'INSTALLED', 'CLOSED'));
  });

  it('allows ticket reopening from CLOSED or RESOLVED to IN_PROGRESS', () => {
    assert.doesNotThrow(() => validateTransition('TICKET', 'RESOLVED', 'CLOSED'));
    assert.doesNotThrow(() => validateTransition('TICKET', 'CLOSED', 'IN_PROGRESS'));
  });
});
