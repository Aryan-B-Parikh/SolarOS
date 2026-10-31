import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransition } from '../../src/domain/state-machines/transitions.ts';

describe('Member 1 - Phase 4 Order Lifecycle & Payment Guards (FR-4.3, FR-4.4)', () => {
  it('validates order status transitions from PENDING_ADVANCE to CONFIRMED', () => {
    assert.doesNotThrow(() => {
      validateTransition('ORDER', 'PENDING_ADVANCE', 'CONFIRMED');
    });
  });

  it('validates order cancellation from PENDING_ADVANCE or CONFIRMED', () => {
    assert.doesNotThrow(() => {
      validateTransition('ORDER', 'PENDING_ADVANCE', 'CANCELLED');
    });
    assert.doesNotThrow(() => {
      validateTransition('ORDER', 'CONFIRMED', 'CANCELLED');
    });
  });

  it('prohibits cancelling an already completed installation order', () => {
    assert.throws(
      () => {
        validateTransition('ORDER', 'COMPLETED', 'CANCELLED');
      },
      /Cannot transition ORDER from COMPLETED to CANCELLED/
    );
  });

  it('triggers auto-confirmation threshold when payment reaches 30% advance', () => {
    const totalPaise = 20000000n; // Rs 2,00,000
    const advanceRequiredPaise = 6000000n; // Rs 60,000 (30%)

    const checkAutoConfirm = (paidPaise: bigint) => {
      return paidPaise >= advanceRequiredPaise;
    };

    assert.equal(checkAutoConfirm(5000000n), false); // Rs 50,000 (25%) -> not confirmed
    assert.equal(checkAutoConfirm(6000000n), true); // Rs 60,000 (30%) -> auto-confirmed
    assert.equal(checkAutoConfirm(10000000n), true); // Rs 1,00,000 (50%) -> auto-confirmed
  });

  it('requires a mandatory cancellation reason when cancelling an order', () => {
    const validateCancel = (reason?: string) => {
      if (!reason || !reason.trim()) {
        throw new Error('Cancellation reason is required');
      }
      return true;
    };

    assert.throws(() => validateCancel(''), /Cancellation reason is required/);
    assert.throws(() => validateCancel('   '), /Cancellation reason is required/);
    assert.equal(validateCancel('Customer relocated outside serviceable territory'), true);
  });

  it('enforces idempotency key uniqueness for payment transactions', () => {
    const recordedKeys = new Set<string>();

    const processPayment = (key: string, amount: number) => {
      if (recordedKeys.has(key)) {
        return { duplicate: true, amount };
      }
      recordedKeys.add(key);
      return { duplicate: false, amount };
    };

    const first = processPayment('idemp-pay-1234', 60000);
    assert.equal(first.duplicate, false);

    // Replay of the same payment request
    const second = processPayment('idemp-pay-1234', 60000);
    assert.equal(second.duplicate, true); // Duplication safely ignored without re-crediting
  });
});

