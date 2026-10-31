import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPaise } from '../../src/lib/money.ts';

describe('Design Tokens & Shared Formatter', () => {
  it('formats currency according to Indian lakh grouping', () => {
    assert.equal(formatPaise(15000000n), 'Rs 1,50,000');
    assert.equal(formatPaise(3450000n), 'Rs 34,500');
    assert.equal(formatPaise(1000000000n), 'Rs 1,00,00,000');
    assert.equal(formatPaise(50000n), 'Rs 500');
  });

  it('handles zero and negative amounts', () => {
    assert.equal(formatPaise(0n), 'Rs 0');
    assert.equal(formatPaise(-250000n), '-Rs 2,500');
  });
});
