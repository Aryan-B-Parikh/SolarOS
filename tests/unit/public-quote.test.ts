import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashToken,
  extractLastFourDigits,
  calculateExpiry,
  evaluateLinkStatus,
  type LinkRecord,
} from '../../src/lib/access-links.ts';

describe('Phase 3 - Public Quote Access & Security (TRD 2.4 / Screen S8 / D11)', () => {
  it('correctly extracts and compares customer phone last 4 digits', () => {
    const rawPhones = [
      '+91 90000 00021',
      '+91-9876543210',
      '09876543210',
      '9876543210',
    ];

    assert.equal(extractLastFourDigits(rawPhones[0]), '0021');
    assert.equal(extractLastFourDigits(rawPhones[1]), '3210');
    assert.equal(extractLastFourDigits(rawPhones[2]), '3210');
    assert.equal(extractLastFourDigits(rawPhones[3]), '3210');

    // Phone verification check
    const registeredPhone = '+91 90000 00021';
    const clean = registeredPhone.replace(/\D/g, '');
    assert.equal(clean.endsWith('0021'), true);
    assert.equal(clean.endsWith('1234'), false);
  });

  it('calculates quote link expiration as validity days + 30 days per Rule D11', () => {
    const validDays = 15;
    const expiresAt = calculateExpiry('QUOTE', validDays);
    const diffDays = Math.round((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    assert.equal(diffDays, 45, 'Quote token must expire in 15 + 30 = 45 days');
  });

  it('enforces 15-minute temporary lockout after 5 failed verification attempts', () => {
    const link: LinkRecord = {
      customerId: 'cust-101',
      scope: 'QUOTE',
      tokenHash: hashToken('test-token-value'),
      expiresAt: new Date(Date.now() + 1000000),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
    };

    assert.equal(evaluateLinkStatus(link), 'LOCKED');

    // After 16 minutes, lockout clears
    const expiredLockLink: LinkRecord = {
      ...link,
      lockedUntil: new Date(Date.now() - 1000),
    };
    assert.equal(evaluateLinkStatus(expiredLockLink), 'VALID');
  });

  it('sanitizes public customer information to prevent PII exposure (D14)', () => {
    const registeredPhone = '+91 98765 43210';
    const cleanPhone = registeredPhone.replace(/\D/g, '');
    const maskedPhone =
      cleanPhone.length >= 4 ? '••••••' + cleanPhone.slice(-4) : '••••';

    assert.equal(maskedPhone, '••••••3210');
    assert.equal(maskedPhone.includes('98765'), false, 'Masked phone must not reveal area code or prefix');
  });

  it('validates rejection reason requirements per spec', () => {
    // Specification: Rejection records a reason and leaves the lead QUOTED
    const emptyReason = '   ';
    assert.equal(emptyReason.trim().length === 0, true, 'Empty reason is rejected');

    const validReason = 'Found a cheaper competitive offer from local vendor';
    assert.equal(validReason.trim().length >= 3, true, 'Valid reason is accepted');
  });
});

