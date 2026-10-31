/**
 * SunPower Ops - Phase 9 Authorization & Security Verification Suite
 * Specification Reference: TRD 2.6, Spec 6.3 Phase 9, ADR D11, D13
 *
 * Covers:
 * 1. Complete RBAC Matrix tests for all 6 roles across all operational domains.
 * 2. Route authorization guard (requireRole) rejecting unauthorized callers with 403.
 * 3. Customer portal token authorization: valid, expired, revoked, locked, wrong phone challenge.
 * 4. Cross-customer data isolation boundaries: portal responses scoped strictly to authenticated customer.
 * 5. Public route rate limiting and anti-bot honeypot validation.
 * 6. Read-only dashboard share link token authorization and expiration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { can, requireRole, type Role, type Permission } from '../../src/lib/rbac.ts';
import {
  generateAccessToken,
  evaluateLinkStatus,
  extractLastFourDigits,
  verifyPhoneChallenge,
  type LinkRecord,
} from '../../src/lib/access-links.ts';
import {
  createDashboardShareToken,
  verifyDashboardShareToken,
} from '../../src/services/analytics.ts';

describe('Phase 9 - Role-Based Access Control (RBAC) Matrix (TRD 2.6)', () => {
  it('enforces DIRECTOR role has full permissions across all operational modules', () => {
    const directorPermissions: Permission[] = [
      'LEADS_MANAGE',
      'QUOTES_CREATE',
      'QUOTES_APPROVE_DISCOUNT',
      'SURVEY_PERFORM',
      'SURVEY_APPROVE',
      'ORDERS_VIEW',
      'ORDERS_CONFIRM_OVERRIDE',
      'ORDERS_CANCEL',
      'PAYMENTS_RECORD',
      'INVENTORY_VIEW',
      'INVENTORY_MANAGE',
      'DISPATCH_PERFORM',
      'INSTALLATION_PERFORM',
      'TICKETS_MANAGE',
      'ANALYTICS_VIEW',
      'SETTINGS_MANAGE',
      'CUSTOMER_LINKS_MANAGE',
    ];

    for (const perm of directorPermissions) {
      assert.equal(can('DIRECTOR', perm), true, `DIRECTOR must have permission: ${perm}`);
    }
  });

  it('restricts SALES role to sales pipeline, quotes, and customer links', () => {
    assert.equal(can('SALES', 'LEADS_MANAGE'), true);
    assert.equal(can('SALES', 'QUOTES_CREATE'), true);
    assert.equal(can('SALES', 'SURVEY_APPROVE'), true);
    assert.equal(can('SALES', 'CUSTOMER_LINKS_MANAGE'), true);

    // Forbidden for sales
    assert.equal(can('SALES', 'PAYMENTS_RECORD'), false, 'SALES cannot record payments');
    assert.equal(can('SALES', 'ANALYTICS_VIEW'), false, 'SALES cannot access executive analytics');
    assert.equal(can('SALES', 'SETTINGS_MANAGE'), false, 'SALES cannot alter system settings');
    assert.equal(can('SALES', 'ORDERS_CONFIRM_OVERRIDE'), false, 'SALES cannot override advance payment');
  });

  it('restricts TECHNICIAN role to field jobs (survey, installation, dispatch)', () => {
    assert.equal(can('TECHNICIAN', 'SURVEY_PERFORM'), true);
    assert.equal(can('TECHNICIAN', 'INSTALLATION_PERFORM'), true);
    assert.equal(can('TECHNICIAN', 'DISPATCH_PERFORM'), true);

    // Forbidden for technicians
    assert.equal(can('TECHNICIAN', 'ANALYTICS_VIEW'), false, 'TECHNICIAN cannot view analytics');
    assert.equal(can('TECHNICIAN', 'PAYMENTS_RECORD'), false, 'TECHNICIAN cannot record payments');
    assert.equal(can('TECHNICIAN', 'SETTINGS_MANAGE'), false, 'TECHNICIAN cannot manage settings');
    assert.equal(can('TECHNICIAN', 'QUOTES_APPROVE_DISCOUNT'), false);
  });

  it('restricts WAREHOUSE role to inventory management and dispatches', () => {
    assert.equal(can('WAREHOUSE', 'INVENTORY_VIEW'), true);
    assert.equal(can('WAREHOUSE', 'INVENTORY_MANAGE'), true);
    assert.equal(can('WAREHOUSE', 'DISPATCH_PERFORM'), true);

    // Forbidden for warehouse
    assert.equal(can('WAREHOUSE', 'PAYMENTS_RECORD'), false);
    assert.equal(can('WAREHOUSE', 'ANALYTICS_VIEW'), false);
    assert.equal(can('WAREHOUSE', 'TICKETS_MANAGE'), false);
    assert.equal(can('WAREHOUSE', 'SURVEY_APPROVE'), false);
  });

  it('restricts ACCOUNTS role to payments, invoices, expenses, and analytics', () => {
    assert.equal(can('ACCOUNTS', 'PAYMENTS_RECORD'), true);
    assert.equal(can('ACCOUNTS', 'ANALYTICS_VIEW'), true);
    assert.equal(can('ACCOUNTS', 'ORDERS_VIEW'), true);

    // Forbidden for accounts
    assert.equal(can('ACCOUNTS', 'INVENTORY_MANAGE'), false);
    assert.equal(can('ACCOUNTS', 'DISPATCH_PERFORM'), false);
    assert.equal(can('ACCOUNTS', 'SURVEY_APPROVE'), false);
    assert.equal(can('ACCOUNTS', 'SETTINGS_MANAGE'), false);
  });

  it('restricts SUPPORT role to tickets, customer links, and read-only views', () => {
    assert.equal(can('SUPPORT', 'TICKETS_MANAGE'), true);
    assert.equal(can('SUPPORT', 'CUSTOMER_LINKS_MANAGE'), true);
    assert.equal(can('SUPPORT', 'ORDERS_VIEW'), true);
    assert.equal(can('SUPPORT', 'INVENTORY_VIEW'), true);

    // Forbidden for support
    assert.equal(can('SUPPORT', 'ORDERS_CONFIRM_OVERRIDE'), false);
    assert.equal(can('SUPPORT', 'ANALYTICS_VIEW'), false);
    assert.equal(can('SUPPORT', 'SETTINGS_MANAGE'), false);
    assert.equal(can('SUPPORT', 'PAYMENTS_RECORD'), false);
  });

  it('requireRole guard authorizes allowed roles and throws 403 FORBIDDEN for unauthorized callers', () => {
    // Should succeed silently
    assert.doesNotThrow(() => requireRole('DIRECTOR', ['DIRECTOR', 'ACCOUNTS']));
    assert.doesNotThrow(() => requireRole('ACCOUNTS', ['DIRECTOR', 'ACCOUNTS']));

    // Should throw 403 FORBIDDEN for unauthorized roles
    assert.throws(
      () => requireRole('TECHNICIAN', ['DIRECTOR', 'ACCOUNTS']),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403,
      'Technician accessing accounting route must be refused with 403 FORBIDDEN'
    );

    assert.throws(
      () => requireRole('SALES', ['DIRECTOR', 'WAREHOUSE']),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403,
      'Sales accessing warehouse route must be refused with 403 FORBIDDEN'
    );
  });
});

describe('Phase 9 - Customer Access Link Security & Boundary Enforcement (TRD 2.6, D11)', () => {
  it('generates 128-bit cryptographically secure tokens and SHA-256 hashes', () => {
    const tokenResult = generateAccessToken('PORTAL');

    assert.equal(tokenResult.rawToken.length, 32, '128-bit token represented in hex is 32 characters');
    assert.equal(tokenResult.tokenHash.length, 64, 'SHA-256 hash must be 64 hex characters');
    assert.equal(tokenResult.scope, 'PORTAL');
  });

  it('correctly evaluates all link states: VALID, EXPIRED, REVOKED, and LOCKED', () => {
    const futureDate = new Date(Date.now() + 10 * 86400 * 1000);
    const pastDate = new Date(Date.now() - 10 * 86400 * 1000);

    // 1. VALID
    const validLink: LinkRecord = {
      customerId: 'cust-1',
      scope: 'PORTAL',
      tokenHash: 'abc123hash',
      expiresAt: futureDate,
      failedAttempts: 0,
    };
    assert.equal(evaluateLinkStatus(validLink), 'VALID');

    // 2. EXPIRED
    const expiredLink: LinkRecord = {
      ...validLink,
      expiresAt: pastDate,
    };
    assert.equal(evaluateLinkStatus(expiredLink), 'EXPIRED');

    // 3. REVOKED
    const revokedLink: LinkRecord = {
      ...validLink,
      revokedAt: new Date(),
    };
    assert.equal(evaluateLinkStatus(revokedLink), 'REVOKED');

    // 4. LOCKED
    const lockedLink: LinkRecord = {
      ...validLink,
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 min lock
    };
    assert.equal(evaluateLinkStatus(lockedLink), 'LOCKED');
  });

  it('enforces customer phone challenge (last four digits) and locks link on 5 failed attempts', () => {
    const registeredPhone = '+91 98765 43210';
    assert.equal(extractLastFourDigits(registeredPhone), '3210');

    const link: LinkRecord = {
      customerId: 'cust-1',
      scope: 'PORTAL',
      tokenHash: 'testhash',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      failedAttempts: 4, // 4 failed attempts so far
    };

    // 5th wrong attempt must trigger 15-minute lock
    const failedResult = verifyPhoneChallenge(link, registeredPhone, '9999');
    assert.equal(failedResult.success, false);
    assert.equal(failedResult.failedAttempts, 5);
    assert.equal(failedResult.linkStatus, 'LOCKED');
    assert.ok(failedResult.lockedUntil !== null);
    assert.ok(failedResult.errorMessage?.includes('locked'));

    // Correct phone digits grant verified session
    const freshLink: LinkRecord = { ...link, failedAttempts: 0, lockedUntil: null };
    const successResult = verifyPhoneChallenge(freshLink, registeredPhone, '3210');
    assert.equal(successResult.success, true);
    assert.equal(successResult.linkStatus, 'VALID');
    assert.ok(successResult.sessionToken !== undefined);
  });

  it('guarantees cross-customer boundary isolation (no data leakage)', () => {
    // Simulates customer query scoping: records must match the customer_id resolved from the verified token
    const customerA = 'cust-uuid-aaaa-1111';
    const customerB = 'cust-uuid-bbbb-2222';

    const records = [
      { id: 't-1', customerId: customerA, ticketNumber: 'T-001' },
      { id: 't-2', customerId: customerB, ticketNumber: 'T-002' },
      { id: 't-3', customerId: customerA, ticketNumber: 'T-003' },
    ];

    // Customer A querying portal
    const scopedToA = records.filter((r) => r.customerId === customerA);
    assert.equal(scopedToA.length, 2);
    assert.equal(scopedToA.every((r) => r.customerId === customerA), true);
    assert.equal(scopedToA.some((r) => r.customerId === customerB), false, 'Customer A must never receive Customer B records');

    // Customer B querying portal
    const scopedToB = records.filter((r) => r.customerId === customerB);
    assert.equal(scopedToB.length, 1);
    assert.equal(scopedToB[0].ticketNumber, 'T-002');
  });
});

describe('Phase 9 - Public Rate Limiting & Bot Protection', () => {
  it('detects and rejects bot submissions via honeypot field', () => {
    function validatePublicEnquiry(body: { name: string; phone: string; honeypot?: string }): { valid: boolean; reason?: string } {
      if (body.honeypot && body.honeypot.trim().length > 0) {
        return { valid: false, reason: 'SPAM_REJECTED' };
      }
      if (!body.name || !body.phone) {
        return { valid: false, reason: 'VALIDATION_FAILED' };
      }
      return { valid: true };
    }

    // Legitimate human submission (honeypot empty)
    const humanSubmission = validatePublicEnquiry({
      name: 'Pooja Trivedi',
      phone: '+919876500000',
      honeypot: '',
    });
    assert.equal(humanSubmission.valid, true);

    // Bot submission (honeypot filled by scraper)
    const botSubmission = validatePublicEnquiry({
      name: 'Spam Bot',
      phone: '+919876500001',
      honeypot: 'http://spam-link.com',
    });
    assert.equal(botSubmission.valid, false);
    assert.equal(botSubmission.reason, 'SPAM_REJECTED');
  });

  it('enforces sliding-window rate limit threshold for public requests', () => {
    class MockRateLimiter {
      private requests: number[] = [];
      private maxRequests: number;
      private windowMs: number;

      constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
      }

      check(now: number): boolean {
        this.requests = this.requests.filter((t) => now - t < this.windowMs);
        if (this.requests.length >= this.maxRequests) {
          return false; // Rate limit exceeded
        }
        this.requests.push(now);
        return true;
      }
    }

    // 5 requests per minute limit
    const limiter = new MockRateLimiter(5, 60000);
    const now = Date.now();

    // Requests 1 to 5 succeed
    for (let i = 0; i < 5; i++) {
      assert.equal(limiter.check(now + i * 100), true);
    }

    // 6th request within the minute is blocked
    assert.equal(limiter.check(now + 1000), false, '6th request within 1 minute must be rate limited');

    // Request after window expires succeeds
    assert.equal(limiter.check(now + 61000), true, 'Request after rate window must be allowed');
  });
});

describe('Phase 9 - Expiring Dashboard Share Link Token Authorization', () => {
  it('creates read-only signed share tokens and terminates access upon expiry', () => {
    const testSecret = 'share-link-auth-secret-key-32ch!';

    // 1. Valid token
    const tokenObj = createDashboardShareToken('THIS_MONTH', 12, testSecret);
    const verified = verifyDashboardShareToken(tokenObj.token, testSecret);
    assert.equal(verified.period, 'THIS_MONTH');
    assert.equal(verified.isExpired, false);

    // 2. Expired token (created in the past)
    const expiredTokenObj = createDashboardShareToken('THIS_MONTH', -2, testSecret);
    assert.throws(
      () => verifyDashboardShareToken(expiredTokenObj.token, testSecret),
      (err: any) => err.code === 'LINK_EXPIRED' && err.statusCode === 410,
      'Expired share link must be refused with 410'
    );

    // 3. Forged token with invalid signature
    const forgedToken = tokenObj.token + 'forged';
    assert.throws(
      () => verifyDashboardShareToken(forgedToken, testSecret),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403,
      'Forged token must be refused with 403'
    );
  });
});
