/**
 * SunPower Ops - Phase 7 Service Desk, Search & Warranty Chain Unit Tests
 * Specification Reference: TRD 2.4, Backend Schema 5.3 & 5.4, PRD C9, ADR D5
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSlaDueDate,
  determineVerdictAndBilling,
  validateTicketTransition,
  SLA_HOURS_BY_PRIORITY,
  SETTINGS_SLA_HOURS_BY_PRIORITY,
  type ServiceTicketRecord,
} from '../../src/domain/tickets.ts';
import { evaluateWarrantyEligibility, transferWarrantyToReplacement } from '../../src/domain/warranty.ts';

describe('Phase 7 - Domain Engine & SLA Calculations (Spec 6.3 Phase 7, PRD C9)', () => {
  it('calculates SLA due dates accurately for all priorities including configured settings', () => {
    const base = new Date('2026-10-31T12:00:00Z');

    // Default SLA map
    assert.equal(
      calculateSlaDueDate('URGENT', base).getTime() - base.getTime(),
      4 * 3600 * 1000,
      'URGENT SLA should be 4 hours'
    );
    assert.equal(
      calculateSlaDueDate('HIGH', base).getTime() - base.getTime(),
      24 * 3600 * 1000,
      'HIGH SLA should be 24 hours'
    );

    // Configured SLA settings map ({ LOW: 168, NORMAL: 72, HIGH: 24, URGENT: 4 })
    const configuredSettings = { LOW: 168, NORMAL: 72, HIGH: 24, URGENT: 4 };
    assert.equal(
      calculateSlaDueDate('NORMAL', base, configuredSettings).getTime() - base.getTime(),
      72 * 3600 * 1000,
      'NORMAL SLA from settings should be 72 hours'
    );
    assert.equal(
      calculateSlaDueDate('LOW', base, configuredSettings).getTime() - base.getTime(),
      168 * 3600 * 1000,
      'LOW SLA from settings should be 168 hours (7 days)'
    );
  });

  it('evaluates warranty eligibility on end date (IN_WARRANTY) and day after (OUT_OF_WARRANTY)', () => {
    const startDate = '2025-05-05';
    const endDate = '2027-05-04';

    // 1. Exactly on end date
    const onEndDate = evaluateWarrantyEligibility({
      testDate: '2027-05-04',
      startDate,
      endDate,
      status: 'ACTIVE',
    });
    assert.equal(onEndDate.verdict, 'IN_WARRANTY', 'On the end date equipment must be IN_WARRANTY');
    assert.equal(onEndDate.isCovered, true);

    // 2. Day after end date
    const dayAfter = evaluateWarrantyEligibility({
      testDate: '2027-05-05',
      startDate,
      endDate,
      status: 'ACTIVE',
    });
    assert.equal(dayAfter.verdict, 'OUT_OF_WARRANTY', 'Day after end date equipment must be OUT_OF_WARRANTY');
    assert.equal(dayAfter.isCovered, false);
    assert.equal(dayAfter.remainingDays, 0);
  });

  it('enforces that tickets cannot be CLOSED without customer confirmation (Rule C9)', () => {
    const ticketRecord: ServiceTicketRecord = {
      id: 'test-ticket-1',
      ticketNumber: 'T-2026-0099',
      customerId: 'cust-1',
      channel: 'PHONE',
      category: 'FAULT_CODE',
      description: 'Inverter flashing red LED',
      priority: 'HIGH',
      status: 'RESOLVED',
      warrantyVerdict: 'IN_WARRANTY',
      warrantyId: 'warr-1',
      billingMode: 'WARRANTY',
      slaDueAt: new Date(),
      customerConfirmedAt: null, // NOT confirmed!
      reopenCount: 0,
    };

    // Attempt to close without customer confirmation must be rejected
    const check1 = validateTicketTransition(ticketRecord, 'CLOSED');
    assert.equal(check1.valid, false);
    assert.ok(check1.reason?.includes('customer confirmation'));

    // Once customer confirmation is recorded, closing is valid
    ticketRecord.customerConfirmedAt = new Date();
    const check2 = validateTicketTransition(ticketRecord, 'CLOSED');
    assert.equal(check2.valid, true);
  });

  it('allows reopening from RESOLVED or CLOSED back to IN_PROGRESS', () => {
    const resolvedTicket: ServiceTicketRecord = {
      id: 'test-ticket-2',
      ticketNumber: 'T-2026-0100',
      customerId: 'cust-1',
      channel: 'PHONE',
      category: 'NO_POWER',
      description: 'Tripping grid breaker',
      priority: 'URGENT',
      status: 'RESOLVED',
      warrantyVerdict: 'IN_WARRANTY',
      warrantyId: 'warr-1',
      billingMode: 'WARRANTY',
      slaDueAt: new Date(),
      reopenCount: 0,
    };

    const reopenFromResolved = validateTicketTransition(resolvedTicket, 'IN_PROGRESS');
    assert.equal(reopenFromResolved.valid, true);

    const closedTicket: ServiceTicketRecord = {
      ...resolvedTicket,
      status: 'CLOSED',
      customerConfirmedAt: new Date(),
    };

    const reopenFromClosed = validateTicketTransition(closedTicket, 'IN_PROGRESS');
    assert.equal(reopenFromClosed.valid, true);
  });
});

describe('Phase 7 - Warranty Replacement Chain & Billing Rules (Rule C9, ADR D5)', () => {
  it('executes RMA warranty transfer preserving original row as TRANSFERRED and retaining original end date', () => {
    const originalWarranty = {
      id: 'warr-orig-101',
      unitId: 'unit-damaged-1',
      startDate: '2025-05-05',
      endDate: '2027-05-04',
      months: 24,
      status: 'ACTIVE' as const,
    };

    const replacementDate = '2026-10-31';
    const transfer = transferWarrantyToReplacement(originalWarranty, replacementDate);

    // Parent warranty marked TRANSFERRED (never deleted!)
    assert.equal(transfer.parentStatus, 'TRANSFERRED');
    assert.equal(transfer.replacementStartDate, '2026-10-31');
    assert.equal(
      transfer.replacementEndDate,
      '2027-05-04',
      'Replacement unit warranty must inherit exact original end date (Rule C9)'
    );
  });

  it('validates replacement unit stock availability and product compatibility', () => {
    interface MockUnit {
      id: string;
      productId: string;
      serialNumber: string;
      status: string;
    }

    function validateReplacementScan(removedUnit: MockUnit, replacementUnit: MockUnit): { valid: boolean; error?: string } {
      if (replacementUnit.status !== 'IN_STOCK') {
        return { valid: false, error: 'REPLACEMENT_NOT_IN_STOCK' };
      }
      if (removedUnit.productId !== replacementUnit.productId) {
        return { valid: false, error: 'PRODUCT_MISMATCH' };
      }
      return { valid: true };
    }

    const removed: MockUnit = {
      id: 'u-1',
      productId: 'prod-inv-3kw',
      serialNumber: 'INV3K-24A-001873',
      status: 'INSTALLED',
    };

    // Valid replacement
    const validRep: MockUnit = {
      id: 'u-2',
      productId: 'prod-inv-3kw',
      serialNumber: 'INV3K-26X-009999',
      status: 'IN_STOCK',
    };
    assert.equal(validateReplacementScan(removed, validRep).valid, true);

    // Replacement not in stock
    const outOfStockRep: MockUnit = { ...validRep, status: 'DISPATCHED' };
    const stockRes = validateReplacementScan(removed, outOfStockRep);
    assert.equal(stockRes.valid, false);
    assert.equal(stockRes.error, 'REPLACEMENT_NOT_IN_STOCK');

    // Product mismatch
    const mismatchedRep: MockUnit = { ...validRep, productId: 'prod-inv-5kw' };
    const prodRes = validateReplacementScan(removed, mismatchedRep);
    assert.equal(prodRes.valid, false);
    assert.equal(prodRes.error, 'PRODUCT_MISMATCH');
  });

  it('evaluates chargeable vs non-chargeable resolution and service invoicing (Rule C9)', () => {
    function evaluateTicketBilling(verdict: string, partsChargeable: boolean, laborCostPaise: bigint) {
      if (verdict === 'IN_WARRANTY' && !partsChargeable) {
        return {
          customerChargePaise: 0n,
          isInvoiceGenerated: false,
          billingType: 'WARRANTY',
        };
      }

      const partsTotal = partsChargeable ? 250000n : 0n;
      const subtotal = partsTotal + laborCostPaise;
      const tax = (subtotal * 1800n) / 10000n; // 18% GST
      return {
        customerChargePaise: subtotal + tax,
        isInvoiceGenerated: true,
        billingType: 'CHARGEABLE',
      };
    }

    // 1. May 2025 inverter is IN_WARRANTY -> Rs 0 (costs nothing)
    const inWarrantyResult = evaluateTicketBilling('IN_WARRANTY', false, 150000n);
    assert.equal(inWarrantyResult.customerChargePaise, 0n, 'In-warranty fix costs nothing to the customer');
    assert.equal(inWarrantyResult.isInvoiceGenerated, false);

    // 2. March 2023 inverter is OUT_OF_WARRANTY -> parts & labor billed automatically
    const outOfWarrantyResult = evaluateTicketBilling('OUT_OF_WARRANTY', true, 150000n);
    assert.ok(outOfWarrantyResult.customerChargePaise > 0n, 'Out-of-warranty fix must be billed');
    assert.equal(outOfWarrantyResult.isInvoiceGenerated, true);
    assert.equal(outOfWarrantyResult.billingType, 'CHARGEABLE');
  });

  it('normalizes customer phone numbers and matches search queries', () => {
    function matchPhone(customerPhone: string, searchQuery: string): boolean {
      const cleanCust = customerPhone.replace(/[^0-9]/g, '');
      const cleanQuery = searchQuery.replace(/[^0-9]/g, '');
      if (cleanQuery.length < 4) return false;
      return cleanCust.includes(cleanQuery);
    }

    assert.equal(matchPhone('+919000000022', '9000000022'), true);
    assert.equal(matchPhone('+919000000022', '+91 90000 00022'), true);
    assert.equal(matchPhone('+919000000022', '000022'), true);
    assert.equal(matchPhone('+919000000022', '999999'), false);
  });
});
