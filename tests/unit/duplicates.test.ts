import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeAddress, isAddressDuplicate } from '../../src/domain/duplicates.ts';

describe('Duplicate Detection Engine (FR-1.4 / Section 2.4)', () => {
  it('normalizes Indian phone numbers to E.164', () => {
    assert.equal(normalizePhone('9876543210'), '+919876543210');
    assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
    assert.equal(normalizePhone('09876543210'), '+09876543210');
  });

  it('normalizes addresses by removing common abbreviations and punctuation', () => {
    const raw = 'Flat 402, Shivalik Residency, Near SG Road, Ahmedabad';
    const norm = normalizeAddress(raw);
    assert.equal(norm.includes(','), false);
    assert.equal(norm.includes('road'), false);
    assert.equal(norm.includes('flat'), false);
  });

  it('detects high similarity for duplicate addresses in the same pincode', () => {
    const addr1 = 'B-42 Shivalik Apartments, Bodakdev';
    const addr2 = 'B 42, Shivalik Apt, Bodakdev';
    const res = isAddressDuplicate(addr1, '380054', addr2, '380054', 0.5);
    assert.equal(res.isDuplicate, true);
    assert.ok(res.score > 0.5);
  });

  it('rejects duplicate match if pincodes differ', () => {
    const addr1 = 'B-42 Shivalik Apartments, Bodakdev';
    const addr2 = 'B-42 Shivalik Apartments, Bodakdev';
    const res = isAddressDuplicate(addr1, '380054', addr2, '380015', 0.5);
    assert.equal(res.isDuplicate, false);
    assert.equal(res.score, 0);
  });
});
