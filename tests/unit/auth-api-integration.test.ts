import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authenticateUser } from '../../src/lib/auth.ts';
import { verifyJwt } from '../../src/lib/jwt.ts';
import { prisma } from '../../src/lib/db.ts';

describe('Auth Service & PostgreSQL Live Integration', () => {
  it('authenticates seeded DIRECTOR user and returns token with /dashboard redirect', async () => {
    const result = await authenticateUser('director@sunpower.ops', 'SunPower@2026', false);

    assert.ok(result.token, 'Must return signed JWT token');
    assert.equal(result.user.email, 'director@sunpower.ops');
    assert.equal(result.user.role, 'DIRECTOR');
    assert.equal(result.redirectTo, '/dashboard');
    assert.ok(result.cookieHeader.includes('sunpower_session='));
    assert.ok(result.cookieHeader.includes('HttpOnly'));

    // Verify database session was persisted
    const payload = verifyJwt(result.token);
    assert.ok(payload?.sessionId, 'Payload must contain sessionId');

    const session = await prisma.session.findUnique({
      where: { id: payload?.sessionId },
    });
    assert.ok(session, 'Database session record must exist');
    assert.equal(session?.user_id, result.user.id);
  });

  it('authenticates seeded TECHNICIAN user and redirects to /tech/today with 30-day session', async () => {
    const result = await authenticateUser('tech1@sunpower.ops', 'SunPower@2026', true);

    assert.equal(result.user.role, 'TECHNICIAN');
    assert.equal(result.redirectTo, '/tech/today');

    const payload = verifyJwt(result.token);
    assert.equal(payload?.isFieldDevice, true);
  });

  it('authenticates seeded SALES user and redirects to /leads', async () => {
    const result = await authenticateUser('sales1@sunpower.ops', 'SunPower@2026', false);

    assert.equal(result.user.role, 'SALES');
    assert.equal(result.redirectTo, '/leads');
  });

  it('authenticates seeded WAREHOUSE user and redirects to /inventory', async () => {
    const result = await authenticateUser('warehouse@sunpower.ops', 'SunPower@2026', false);

    assert.equal(result.user.role, 'WAREHOUSE');
    assert.equal(result.redirectTo, '/inventory');
  });

  it('authenticates seeded ACCOUNTS user and redirects to /analytics', async () => {
    const result = await authenticateUser('accounts@sunpower.ops', 'SunPower@2026', false);

    assert.equal(result.user.role, 'ACCOUNTS');
    assert.equal(result.redirectTo, '/analytics');
  });

  it('authenticates seeded SUPPORT user and redirects to /service', async () => {
    const result = await authenticateUser('support@sunpower.ops', 'SunPower@2026', false);

    assert.equal(result.user.role, 'SUPPORT');
    assert.equal(result.redirectTo, '/service');
  });

  it('rejects invalid password with 401 INVALID_CREDENTIALS', async () => {
    await assert.rejects(
      async () => {
        await authenticateUser('director@sunpower.ops', 'WrongPassword123');
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });
});

