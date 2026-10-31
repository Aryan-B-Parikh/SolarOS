import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateAccessToken, hashToken } from '../../src/lib/access-links.ts';

describe('Phase 6 - Commissioning Certificate & Digital Proof (C8, Rule D11)', () => {
  it('generates 90-day certificate access tokens with SHA-256 hash', () => {
    const certLink = generateAccessToken('CERTIFICATE');
    assert.equal(certLink.rawToken.length, 32);
    assert.equal(certLink.tokenHash.length, 64);
    assert.equal(hashToken(certLink.rawToken), certLink.tokenHash);

    const diffDays = Math.round((certLink.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    assert.equal(diffDays, 90, 'Certificate tokens expire in 90 days');
  });

  it('computes deterministic SHA-256 cryptographic proof hash', () => {
    const jobId = 'job-2026-0042';
    const signedName = 'Ramesh Patel';
    const installedCapacity = '3.00';
    const serialList = 'SOL-540W-9901,SOL-540W-9902,INV-3KW-8812';
    const timestamp = '2026-11-12T14:30:00Z';

    const proofString = `${jobId}:${signedName}:${installedCapacity}:${serialList}:${timestamp}`;
    const hash = crypto.createHash('sha256').update(proofString).digest('hex');

    assert.equal(hash.length, 64);
    assert.equal(typeof hash, 'string');

    // Tampering with any property produces different hash
    const tampered = `${jobId}:Different Person:${installedCapacity}:${serialList}:${timestamp}`;
    const tamperedHash = crypto.createHash('sha256').update(tampered).digest('hex');
    assert.notEqual(hash, tamperedHash);
  });
});

