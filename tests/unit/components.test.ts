import { describe, it, expect } from 'vitest';
import { formatPaise } from '@/lib/money';

describe('Design Tokens & Shared Formatter', () => {
  it('formats currency according to Indian lakh grouping', () => {
    expect(formatPaise(15000000n)).toBe('Rs 1,50,000');
    expect(formatPaise(3450000n)).toBe('Rs 34,500');
    expect(formatPaise(1000000000n)).toBe('Rs 1,00,00,000');
    expect(formatPaise(50000n)).toBe('Rs 500');
  });

  it('handles zero and negative amounts', () => {
    expect(formatPaise(0n)).toBe('Rs 0');
    expect(formatPaise(-250000n)).toBe('-Rs 2,500');
  });
});
