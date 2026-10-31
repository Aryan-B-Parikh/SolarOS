import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeAddress, calculateTrigramSimilarity, isAddressDuplicate } from '@/domain/duplicates';

describe('Duplicate Detection Engine (FR-1.4 / Section 2.4)', () => {
  it('normalizes Indian phone numbers to E.164', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+09876543210');
  });

  it('normalizes addresses by removing common abbreviations and punctuation', () => {
    const raw = 'Flat 402, Shivalik Residency, Near SG Road, Ahmedabad';
    const norm = normalizeAddress(raw);
    expect(norm).not.toContain(',');
    expect(norm).not.toContain('road');
    expect(norm).not.toContain('flat');
  });

  it('detects high similarity for duplicate addresses in the same pincode', () => {
    const addr1 = 'B-42 Shivalik Apartments, Bodakdev';
    const addr2 = 'B 42, Shivalik Apt, Bodakdev';
    const res = isAddressDuplicate(addr1, '380054', addr2, '380054', 0.5);
    expect(res.isDuplicate).toBe(true);
    expect(res.score).toBeGreaterThan(0.5);
  });

  it('rejects duplicate match if pincodes differ', () => {
    const addr1 = 'B-42 Shivalik Apartments, Bodakdev';
    const addr2 = 'B-42 Shivalik Apartments, Bodakdev';
    const res = isAddressDuplicate(addr1, '380054', addr2, '380015', 0.5);
    expect(res.isDuplicate).toBe(false);
    expect(res.score).toBe(0);
  });
});
