import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAccessToken,
  hashToken,
  evaluateLinkStatus,
  extractLastFourDigits,
  verifyPhoneChallenge,
  validateVerifiedSessionToken,
  type LinkRecord,
} from '../../src/lib/access-links.ts';

describe('Customer Access Link Security Engine (TRD 2.6, D11)', () => {
  it('generates 128-bit random token and valid SHA-256 hash', () => {
    const link = generateAccessToken('PORTAL');

    assert.equal(link.rawToken.length, 32, '128-bit token must be 32 hex chars');
    assert.equal(link.tokenHash.length, 64, 'SHA-256 hash must be 64 hex chars');
    assert.equal(hashToken(link.rawToken), link.tokenHash);

    // Verify 90-day expiry for portal scope
    const diffDays = Math.round((link.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    assert.equal(diffDays, 90, 'Portal token must expire in 90 days');
  });

  it('calculates quote token expiration as quote validity plus 30 days', () => {
    const quoteValidityDays = 15;
    const link = generateAccessToken('QUOTE', quoteValidityDays);
    const diffDays = Math.round((link.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    assert.equal(diffDays, 45, 'Quote token must expire in validity (15) + 30 = 45 days');
  });

  it('correctly identifies link states (VALID, EXPIRED, REVOKED, LOCKED)', () => {
    const validLink: LinkRecord = {
      customerId: 'cust-1',
      scope: 'PORTAL',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 100000),
      failedAttempts: 0,
    };
    assert.equal(evaluateLinkStatus(validLink), 'VALID');

    const revokedLink: LinkRecord = {
      ...validLink,
      revokedAt: new Date(Date.now() - 5000),
    };
    assert.equal(evaluateLinkStatus(revokedLink), 'REVOKED');

    const expiredLink: LinkRecord = {
      ...validLink,
      expiresAt: new Date(Date.now() - 5000),
    };
    assert.equal(evaluateLinkStatus(expiredLink), 'EXPIRED');

    const lockedLink: LinkRecord = {
      ...validLink,
      lockedUntil: new Date(Date.now() + 60000),
    };
    assert.equal(evaluateLinkStatus(lockedLink), 'LOCKED');
  });

  it('extracts last four digits of various phone number formats', () => {
    assert.equal(extractLastFourDigits('+91 90000 00021'), '0021');
    assert.equal(extractLastFourDigits('9876543210'), '3210');
    assert.equal(extractLastFourDigits('+91-888-777-6655'), '6655');
  });

  it('verifies phone challenge and issues 30-minute session token on success', () => {
    const link: LinkRecord = {
      customerId: 'cust-123',
      scope: 'PORTAL',
      tokenHash: 'sample-token-hash-123',
      expiresAt: new Date(Date.now() + 1000000),
      failedAttempts: 0,
    };

    const result = verifyPhoneChallenge(link, '+91 90000 00021', '0021');
    assert.equal(result.success, true);
    assert.ok(result.sessionToken, 'Session token must be returned on success');
    assert.ok(result.sessionExpiresAt);

    // Validate the issued session token
    const isValid = validateVerifiedSessionToken(
      result.sessionToken!,
      link.tokenHash,
      link.customerId
    );
    assert.equal(isValid, true, 'Issued session token must validate successfully');

    // Reject token if bound to wrong customer or hash
    assert.equal(
      validateVerifiedSessionToken(result.sessionToken!, 'wrong-hash', link.customerId),
      false
    );
  });

  it('locks link for 15 minutes after 5 failed attempts', () => {
    let link: LinkRecord = {
      customerId: 'cust-123',
      scope: 'PORTAL',
      tokenHash: 'sample-token-hash-123',
      expiresAt: new Date(Date.now() + 1000000),
      failedAttempts: 4, // 4 prior failures
    };

    // 5th failure
    const fifthResult = verifyPhoneChallenge(link, '+91 90000 00021', '9999');
    assert.equal(fifthResult.success, false);
    assert.equal(fifthResult.failedAttempts, 5);
    assert.equal(fifthResult.linkStatus, 'LOCKED');
    assert.ok(fifthResult.lockedUntil, 'Lock expiration must be set');

    // Remaining minutes should be approximately 15
    assert.equal(fifthResult.lockRemainingMinutes, 15);
  });
});
