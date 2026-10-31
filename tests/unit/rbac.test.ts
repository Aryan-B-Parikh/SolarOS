import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { can, requireRole } from '../../src/lib/rbac.ts';

describe('RBAC Matrix', () => {
  it('allows DIRECTOR full permissions including analytics and settings', () => {
    assert.equal(can('DIRECTOR', 'ANALYTICS_VIEW'), true);
    assert.equal(can('DIRECTOR', 'SETTINGS_MANAGE'), true);
    assert.equal(can('DIRECTOR', 'ORDERS_CONFIRM_OVERRIDE'), true);
  });

  it('prohibits TECHNICIAN from viewing analytics or settings', () => {
    assert.equal(can('TECHNICIAN', 'ANALYTICS_VIEW'), false);
    assert.equal(can('TECHNICIAN', 'SETTINGS_MANAGE'), false);
    assert.throws(() => requireRole('TECHNICIAN', ['DIRECTOR', 'ACCOUNTS']), /Access forbidden/);
  });

  it('allows ACCOUNTS to record payments and view analytics', () => {
    assert.equal(can('ACCOUNTS', 'PAYMENTS_RECORD'), true);
    assert.equal(can('ACCOUNTS', 'ANALYTICS_VIEW'), true);
    assert.equal(can('ACCOUNTS', 'INVENTORY_MANAGE'), false);
  });

  it('allows SUPPORT to manage tickets and issue customer links', () => {
    assert.equal(can('SUPPORT', 'TICKETS_MANAGE'), true);
    assert.equal(can('SUPPORT', 'CUSTOMER_LINKS_MANAGE'), true);
  });
});
