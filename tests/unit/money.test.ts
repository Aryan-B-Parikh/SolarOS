import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPaise, rupeesToPaise, paiseToRupees, parseMoneyToPaise } from '../../src/lib/money.ts';

describe('Money Helper', () => {
  it('converts rupees to paise accurately', () => {
    assert.equal(rupeesToPaise(150000), 15000000n);
    assert.equal(rupeesToPaise(34500.5), 3450050n);
  });

  it('converts paise to rupees accurately', () => {
    assert.equal(paiseToRupees(15000000n), 150000);
    assert.equal(paiseToRupees(3450050n), 34500.5);
  });

  it('formats rupees with Indian Lakh grouping', () => {
    assert.equal(formatPaise(15000000n), 'Rs 1,50,000');
    assert.equal(formatPaise(3450000n), 'Rs 34,500');
    assert.equal(formatPaise(1000000000n), 'Rs 1,00,00,000');
    assert.equal(formatPaise(500n), 'Rs 5');
  });

  it('formats negative amounts correctly', () => {
    assert.equal(formatPaise(-15000000n), '-Rs 1,50,000');
  });

  it('parses formatted input string to paise', () => {
    assert.equal(parseMoneyToPaise('Rs 1,50,000'), 15000000n);
    assert.equal(parseMoneyToPaise('₹ 34,500.50'), 3450050n);
  });
});
