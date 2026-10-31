import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSlaDueDate,
  determineVerdictAndBilling,
  validateTicketTransition,
  type ServiceTicketRecord,
} from '../../src/domain/tickets.ts';

describe('Service Ticket State Machine & SLA Engine (PRD C9, Phase 7)', () => {
  it('computes correct SLA due dates by priority', () => {
    const base = new Date('2026-10-31T10:00:00Z');

    const urgent = calculateSlaDueDate('URGENT', base);
    assert.equal(urgent.getTime() - base.getTime(), 4 * 3600 * 1000, 'URGENT should be 4h');

    const high = calculateSlaDueDate('HIGH', base);
    assert.equal(high.getTime() - base.getTime(), 24 * 3600 * 1000, 'HIGH should be 24h');

    const normal = calculateSlaDueDate('NORMAL', base);
    assert.equal(normal.getTime() - base.getTime(), 48 * 3600 * 1000, 'NORMAL should be 48h');

    const low = calculateSlaDueDate('LOW', base);
    assert.equal(low.getTime() - base.getTime(), 72 * 3600 * 1000, 'LOW should be 72h');
  });

  it('determines warranty verdicts accurately for active vs expired units', () => {
    const checkDate = new Date('2026-10-31T12:00:00Z');

    // 1. May 2025 install (active warranty until May 2027)
    const activeWarranty = {
      id: 'warr-active-1',
      status: 'ACTIVE',
      endDate: new Date('2027-05-04T23:59:59Z'),
    };
    const inWarrVerdict = determineVerdictAndBilling(activeWarranty, false, checkDate);
    assert.equal(inWarrVerdict.verdict, 'IN_WARRANTY');
    assert.equal(inWarrVerdict.billingMode, 'WARRANTY');
    assert.equal(inWarrVerdict.warrantyId, 'warr-active-1');

    // 2. March 2023 install (warranty expired March 2025)
    const expiredWarranty = {
      id: 'warr-expired-1',
      status: 'ACTIVE',
      endDate: new Date('2025-03-01T23:59:59Z'),
    };
    const outWarrVerdict = determineVerdictAndBilling(expiredWarranty, false, checkDate);
    assert.equal(outWarrVerdict.verdict, 'OUT_OF_WARRANTY');
    assert.equal(outWarrVerdict.billingMode, 'CHARGEABLE');

    // 3. Excluded warranty (tampered/damaged)
    const excludedVerdict = determineVerdictAndBilling(activeWarranty, true, checkDate);
    assert.equal(excludedVerdict.verdict, 'EXCLUDED');
    assert.equal(excludedVerdict.billingMode, 'CHARGEABLE');

    // 4. Unknown unit
    const unknownVerdict = determineVerdictAndBilling(null, false, checkDate);
    assert.equal(unknownVerdict.verdict, 'UNKNOWN_UNIT');
    assert.equal(unknownVerdict.billingMode, 'CHARGEABLE');
  });

  it('enforces that a ticket cannot be CLOSED without customer confirmation', () => {
    const ticket: ServiceTicketRecord = {
      id: 't-1',
      ticketNumber: 'TICK-2026-0001',
      customerId: 'c-1',
      channel: 'PHONE',
      category: 'NO_POWER',
      description: 'Inverter tripping on red LED',
      priority: 'HIGH',
      status: 'CONFIRMED',
      warrantyVerdict: 'IN_WARRANTY',
      warrantyId: 'warr-1',
      billingMode: 'WARRANTY',
      slaDueAt: new Date(),
      customerConfirmedAt: null, // NOT confirmed by customer yet!
      reopenCount: 0,
    };

    const invalidClose = validateTicketTransition(ticket, 'CLOSED');
    assert.equal(invalidClose.valid, false);
    assert.ok(invalidClose.reason?.includes('customer confirmation'));

    // Once customer confirms, closing is valid
    ticket.customerConfirmedAt = new Date();
    const validClose = validateTicketTransition(ticket, 'CLOSED');
    assert.equal(validClose.valid, true);
  });
});
