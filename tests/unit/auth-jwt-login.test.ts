import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  signJwt,
  verifyJwt,
  generateSessionCookie,
  generateClearSessionCookie,
  extractToken,
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  resetLockoutStore,
  SESSION_COOKIE_NAME,
  STAFF_SESSION_TTL_SECONDS,
  FIELD_DEVICE_SESSION_TTL_SECONDS,
} from '../../src/lib/jwt.ts';
import {
  can,
  requireRole,
  isRouteAllowedForRole,
  getRoleDefaultRoute,
  ROLE_DEFAULT_ROUTES,
  ROLE_DISPLAY_NAMES,
  type Role,
} from '../../src/lib/rbac.ts';
import { hashPassword, verifyPassword } from '../../src/lib/auth.ts';

describe('Auth & JWT Security Engine (TRD 2.6, Spec v1.1)', () => {
  const TEST_SECRET = 'test-secret-key-that-is-at-least-32-chars-long!';

  beforeEach(() => {
    resetLockoutStore();
  });

  describe('RFC 7519 Compliant HS256 JWT Implementation', () => {
    it('signs and verifies valid JWT payload with standard staff expiration (12 hours)', () => {
      const payload = {
        userId: 'usr-dir-001',
        email: 'director@sunpower.ops',
        name: 'Rajesh Shah',
        role: 'DIRECTOR' as Role,
        isFieldDevice: false,
      };

      const token = signJwt(payload, TEST_SECRET);
      assert.ok(token, 'JWT must be generated');

      const parts = token.split('.');
      assert.equal(parts.length, 3, 'JWT must contain header, payload, and signature');

      const verified = verifyJwt(token, TEST_SECRET);
      assert.ok(verified, 'JWT verification must succeed');
      assert.equal(verified?.userId, payload.userId);
      assert.equal(verified?.email, payload.email);
      assert.equal(verified?.role, 'DIRECTOR');

      // Check 12-hour expiration
      const ttl = (verified?.exp || 0) - (verified?.iat || 0);
      assert.equal(ttl, STAFF_SESSION_TTL_SECONDS, 'Staff session must expire after 12 idle hours (43200s)');
    });

    it('signs field device sessions with 30-day expiration (Spec 2.6)', () => {
      const payload = {
        userId: 'usr-tech-001',
        email: 'tech1@sunpower.ops',
        name: 'Vijay Parmar',
        role: 'TECHNICIAN' as Role,
        isFieldDevice: true,
      };

      const token = signJwt(payload, TEST_SECRET);
      const verified = verifyJwt(token, TEST_SECRET);

      assert.ok(verified, 'Field device JWT verification must succeed');
      assert.equal(verified?.isFieldDevice, true);

      // Check 30-day expiration
      const ttl = (verified?.exp || 0) - (verified?.iat || 0);
      assert.equal(ttl, FIELD_DEVICE_SESSION_TTL_SECONDS, 'Field device session must expire after 30 days (2592000s)');
    });

    it('rejects tampered JWT signature', () => {
      const payload = {
        userId: 'usr-sales-001',
        email: 'sales1@sunpower.ops',
        name: 'Amit Verma',
        role: 'SALES' as Role,
      };

      const token = signJwt(payload, TEST_SECRET);
      const [header, body, sig] = token.split('.');

      // Tamper with signature
      const tamperedSig = sig.slice(0, -4) + 'abcd';
      const tamperedToken = `${header}.${body}.${tamperedSig}`;

      const verified = verifyJwt(tamperedToken, TEST_SECRET);
      assert.equal(verified, null, 'Must reject tampered signature');
    });

    it('rejects tampered payload (privilege escalation attempt)', () => {
      const payload = {
        userId: 'usr-tech-001',
        email: 'tech1@sunpower.ops',
        name: 'Vijay Parmar',
        role: 'TECHNICIAN' as Role,
      };

      const token = signJwt(payload, TEST_SECRET);
      const [header, , sig] = token.split('.');

      // Attacker tampers with payload to escalate role to DIRECTOR
      const escalatedPayload = {
        ...payload,
        role: 'DIRECTOR',
      };
      const tamperedBody = Buffer.from(JSON.stringify(escalatedPayload)).toString('base64url');
      const tamperedToken = `${header}.${tamperedBody}.${sig}`;

      const verified = verifyJwt(tamperedToken, TEST_SECRET);
      assert.equal(verified, null, 'Must reject payload modified after signing');
    });

    it('rejects expired tokens', () => {
      const payload = {
        userId: 'usr-dir-001',
        email: 'director@sunpower.ops',
        name: 'Rajesh Shah',
        role: 'DIRECTOR' as Role,
      };

      // Sign with negative expiration (expired 10 seconds ago)
      const token = signJwt(payload, TEST_SECRET, -10);
      const verified = verifyJwt(token, TEST_SECRET);
      assert.equal(verified, null, 'Must reject expired token');
    });

    it('rejects tokens signed with different secret key', () => {
      const payload = {
        userId: 'usr-dir-001',
        email: 'director@sunpower.ops',
        name: 'Rajesh Shah',
        role: 'DIRECTOR' as Role,
      };

      const token = signJwt(payload, 'secret-key-one-12345678901234567890');
      const verified = verifyJwt(token, 'different-secret-key-9876543210987654');
      assert.equal(verified, null, 'Must reject token verified with wrong secret');
    });
  });

  describe('Session Cookies & Header Extraction', () => {
    it('generates standard HttpOnly, SameSite=Lax session cookie', () => {
      const cookie = generateSessionCookie('sample.jwt.token', false);
      assert.ok(cookie.includes(`${SESSION_COOKIE_NAME}=sample.jwt.token`));
      assert.ok(cookie.includes('HttpOnly'));
      assert.ok(cookie.includes('SameSite=Lax'));
      assert.ok(cookie.includes(`Max-Age=${STAFF_SESSION_TTL_SECONDS}`));
    });

    it('generates 30-day session cookie for field devices', () => {
      const cookie = generateSessionCookie('sample.jwt.token', true);
      assert.ok(cookie.includes(`Max-Age=${FIELD_DEVICE_SESSION_TTL_SECONDS}`));
    });

    it('generates clear session cookie with Max-Age=0', () => {
      const clearCookie = generateClearSessionCookie();
      assert.ok(clearCookie.includes('Max-Age=0'));
      assert.ok(clearCookie.includes('HttpOnly'));
    });

    it('extracts token from cookie header or authorization bearer header', () => {
      const cookieHeader = `theme=dark; ${SESSION_COOKIE_NAME}=my.jwt.token; other=123`;
      assert.equal(extractToken(cookieHeader, null), 'my.jwt.token');

      const authHeader = 'Bearer my.bearer.token';
      assert.equal(extractToken(null, authHeader), 'my.bearer.token');
    });
  });

  describe('Account Lockout Engine (TRD 2.6)', () => {
    const testEmail = 'badactor@example.com';

    it('keeps account unlocked under 10 failed attempts', () => {
      for (let i = 1; i <= 9; i++) {
        const result = recordFailedAttempt(testEmail);
        assert.equal(result.locked, false, `Attempt ${i} must not lock account`);
        assert.equal(result.attemptsCount, i);
        assert.equal(result.remainingAttempts, 10 - i);
      }

      const status = checkAccountLockout(testEmail);
      assert.equal(status.locked, false, 'Account must remain unlocked after 9 attempts');
    });

    it('locks account for 15 minutes upon 10th failed attempt (Spec 2.6)', () => {
      // 9 failures
      for (let i = 1; i <= 9; i++) {
        recordFailedAttempt(testEmail);
      }

      // 10th failure triggers lock
      const tenthResult = recordFailedAttempt(testEmail);
      assert.equal(tenthResult.locked, true, '10th attempt must lock account');
      assert.equal(tenthResult.remainingAttempts, 0);
      assert.equal(tenthResult.remainingMinutes, 15, 'Lock duration must be 15 minutes');

      // Subsequent checks report locked
      const check = checkAccountLockout(testEmail);
      assert.equal(check.locked, true);
      assert.equal(check.remainingMinutes, 15);
    });

    it('clears failed attempts upon successful login', () => {
      // 5 failed attempts
      for (let i = 1; i <= 5; i++) {
        recordFailedAttempt(testEmail);
      }

      // User provides correct password -> reset
      clearFailedAttempts(testEmail);

      const status = checkAccountLockout(testEmail);
      assert.equal(status.locked, false);

      // Next attempt starts fresh from 1
      const nextAttempt = recordFailedAttempt(testEmail);
      assert.equal(nextAttempt.attemptsCount, 1);
    });
  });

  describe('Role-Based Access Control (RBAC) & Route Matrix', () => {
    it('maps all 6 specification roles to their correct default landing routes', () => {
      assert.equal(getRoleDefaultRoute('DIRECTOR'), '/dashboard');
      assert.equal(getRoleDefaultRoute('SALES'), '/leads');
      assert.equal(getRoleDefaultRoute('TECHNICIAN'), '/tech/today');
      assert.equal(getRoleDefaultRoute('WAREHOUSE'), '/inventory');
      assert.equal(getRoleDefaultRoute('SUPPORT'), '/service');
      assert.equal(getRoleDefaultRoute('ACCOUNTS'), '/analytics');
    });

    it('provides human-readable display titles for all 6 roles', () => {
      assert.equal(ROLE_DISPLAY_NAMES.DIRECTOR, 'Director');
      assert.equal(ROLE_DISPLAY_NAMES.SALES, 'Sales Representative');
      assert.equal(ROLE_DISPLAY_NAMES.TECHNICIAN, 'Field Technician Lead');
      assert.equal(ROLE_DISPLAY_NAMES.WAREHOUSE, 'Warehouse Operations');
      assert.equal(ROLE_DISPLAY_NAMES.SUPPORT, 'Customer Support Lead');
      assert.equal(ROLE_DISPLAY_NAMES.ACCOUNTS, 'Accounts & Finance Lead');
    });

    it('allows DIRECTOR company-wide access to all sections', () => {
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/dashboard'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/leads'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/quotes'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/orders'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/inventory'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/dispatch'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/service'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/analytics'), true);
      assert.equal(isRouteAllowedForRole('DIRECTOR', '/settings'), true);
    });

    it('strictly confines TECHNICIAN to field routes (/tech/*) only', () => {
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/tech/today'), true);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/tech/jobs'), true);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/tech/scan'), true);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/tech/profile'), true);

      // Forbidden from staff management portals
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/dashboard'), false);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/leads'), false);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/inventory'), false);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/analytics'), false);
      assert.equal(isRouteAllowedForRole('TECHNICIAN', '/settings'), false);
    });

    it('allows SALES to access CRM and quotations, but restricts warehouse and finance', () => {
      assert.equal(isRouteAllowedForRole('SALES', '/leads'), true);
      assert.equal(isRouteAllowedForRole('SALES', '/quotes'), true);
      assert.equal(isRouteAllowedForRole('SALES', '/orders'), true);

      // Forbidden from dispatch queue, inventory write, analytics, settings
      assert.equal(isRouteAllowedForRole('SALES', '/dispatch'), false);
      assert.equal(isRouteAllowedForRole('SALES', '/analytics'), false);
      assert.equal(isRouteAllowedForRole('SALES', '/settings'), false);
      assert.equal(isRouteAllowedForRole('SALES', '/tech/today'), false);
    });

    it('allows WAREHOUSE to access inventory and dispatch, but restricts CRM and finance', () => {
      assert.equal(isRouteAllowedForRole('WAREHOUSE', '/inventory'), true);
      assert.equal(isRouteAllowedForRole('WAREHOUSE', '/dispatch'), true);
      assert.equal(isRouteAllowedForRole('WAREHOUSE', '/orders'), true);

      // Forbidden
      assert.equal(isRouteAllowedForRole('WAREHOUSE', '/leads'), false);
      assert.equal(isRouteAllowedForRole('WAREHOUSE', '/analytics'), false);
      assert.equal(isRouteAllowedForRole('WAREHOUSE', '/settings'), false);
    });

    it('allows ACCOUNTS to access analytics and orders, but restricts inventory and field', () => {
      assert.equal(isRouteAllowedForRole('ACCOUNTS', '/analytics'), true);
      assert.equal(isRouteAllowedForRole('ACCOUNTS', '/orders'), true);
      assert.equal(isRouteAllowedForRole('ACCOUNTS', '/accounts'), true);

      // Forbidden
      assert.equal(isRouteAllowedForRole('ACCOUNTS', '/inventory'), false);
      assert.equal(isRouteAllowedForRole('ACCOUNTS', '/dispatch'), false);
      assert.equal(isRouteAllowedForRole('ACCOUNTS', '/service'), false);
    });

    it('allows SUPPORT to access ticketing and service desk', () => {
      assert.equal(isRouteAllowedForRole('SUPPORT', '/service'), true);
      assert.equal(isRouteAllowedForRole('SUPPORT', '/orders'), true);

      // Forbidden
      assert.equal(isRouteAllowedForRole('SUPPORT', '/analytics'), false);
      assert.equal(isRouteAllowedForRole('SUPPORT', '/settings'), false);
    });

    it('allows all users access to public endpoints (login, portal, enquiry)', () => {
      const publicPaths = ['/login', '/portal', '/enquiry', '/certificate/cert-123'];
      const roles: Role[] = ['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'];

      for (const role of roles) {
        for (const path of publicPaths) {
          assert.equal(isRouteAllowedForRole(role, path), true);
        }
      }
    });
  });

  describe('Password Verification Security', () => {
    it('hashes and verifies passwords securely', async () => {
      const rawPassword = 'SunPower@2026';
      const hash = await hashPassword(rawPassword);

      assert.ok(hash.startsWith('$argon2') || hash.startsWith('scrypt:'), 'Hash must use Argon2id or secure scrypt');

      const isMatch = await verifyPassword(rawPassword, hash);
      assert.equal(isMatch, true, 'Correct password must verify');

      const isBadMatch = await verifyPassword('WrongPassword123', hash);
      assert.equal(isBadMatch, false, 'Incorrect password must be rejected');
    });
  });
});

