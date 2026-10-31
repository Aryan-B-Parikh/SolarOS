/**
 * SunPower Ops - Phase 8 Analytics, Finance & Predictive Maintenance Unit Tests
 * Specification Reference: TRD 2.4, Spec 6.3 Phase 8, Rule C10, C11, C12
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMaterialsCostPaise,
  calculateLabourCostPaise,
  calculateExpensesCostPaise,
  calculateProjectProfitability,
} from '../../src/domain/profitability.ts';
import {
  evaluateInstallationMaintenanceRules,
  calculateAggregateRiskScore,
} from '../../src/domain/maintenance.ts';
import {
  getISTMonthRange,
  getISTDayRange,
  getISTPeriodRanges,
} from '../../src/lib/dates.ts';
import {
  createDashboardShareToken,
  verifyDashboardShareToken,
  aggregateMaterialsCostPaise,
} from '../../src/services/analytics.ts';

describe('Phase 8 - Financial Math & Project Profitability (Spec 6.3, Rule C10)', () => {
  it('matches October 2026 hand-calculated project profitability fixture down to the paisa', () => {
    // Hand-calculated fixture:
    // Order: 3 kW On-Grid System
    // Subtotal: ₹3,60,000.00 (36,000,000 paise), Discount: ₹10,000.00 (1,000,000 paise) -> Net: ₹3,50,000.00 (35,000,000 paise)
    // Materials:
    //   - 6x Solar Panels @ ₹15,000.00 = ₹90,000 (9,000,000 paise)
    //   - 1x 3kW Inverter @ ₹45,000.00 = ₹45,000 (4,500,000 paise)
    //   - 1x Returned Excess AC Cable @ ₹2,500.00 = -₹2,500 (-250,000 paise)
    //   Net Materials = ₹1,32,500.00 (13,250,000 paise)
    // Labour:
    //   - Tech Lead: 8.5 hours (30,600 sec) @ ₹300/hr (30,000 paise/hr) = ₹2,550.00 (255,000 paise)
    //   - Assistant: 6.0 hours (21,600 sec) @ ₹250/hr (25,000 paise/hr) = ₹1,500.00 (150,000 paise)
    //   Total Labour = ₹4,050.00 (405,000 paise)
    // Expenses:
    //   - Site Travel & Safety Lunch: ₹1,850.00 (185,000 paise)
    // Total Project Cost = ₹1,32,500 + ₹4,050 + ₹1,850 = ₹1,38,400.00 (13,840,000 paise)
    // Install Profit = ₹3,50,000 - ₹1,38,400 = ₹2,11,600.00 (21,160,000 paise)
    // Margin Bp = (21,160,000 / 35,000,000) * 10,000 = 6045 bp (60.45%)

    const result = calculateProjectProfitability({
      orderId: 'ord-fixture-1',
      orderNumber: 'SO-2026-0042',
      customerId: 'cust-1',
      customerName: 'Kishore Patel',
      status: 'INSTALLED',
      subtotalPaise: 36000000n,
      discountPaise: 1000000n,
      stockMovements: [
        { type: 'DISPATCH', qty: 6, unitCostPaise: 1500000n },
        { type: 'DISPATCH', qty: 1, unitCostPaise: 4500000n },
        { type: 'RETURN', qty: 1, unitCostPaise: 250000n }, // Returned cable
      ],
      timeLogs: [
        {
          startedAt: '2026-10-15T09:00:00Z',
          endedAt: '2026-10-15T17:30:00Z', // 8.5 hours
          hourlyCostPaise: 30000n,
        },
        {
          startedAt: '2026-10-15T09:30:00Z',
          endedAt: '2026-10-15T15:30:00Z', // 6.0 hours
          hourlyCostPaise: 25000n,
        },
      ],
      expenses: [
        { amountPaise: 185000n },
      ],
    });

    assert.equal(result.netRevenuePaise, 35000000n, 'Net revenue must be exactly 35,000,000 paise');
    assert.equal(result.materialsPaise, 13250000n, 'Materials cost must subtract returns and equal 13,250,000 paise');
    assert.equal(result.labourPaise, 405000n, 'Labour cost must equal 405,000 paise');
    assert.equal(result.expensesPaise, 185000n, 'Expenses must equal 185,000 paise');
    assert.equal(result.installProfitPaise, 21160000n, 'Install profit must match hand calculation to the paisa (21,160,000)');
    assert.equal(result.marginBp, 6045, 'Margin basis points must be 6045 bp');
    assert.equal(result.marginPercent, '60.5%');
    assert.equal(result.isLoss, false, 'Project must be profitable');
  });

  it('accurately identifies and flags loss-making projects (Rule C10)', () => {
    // Project where cost exceeds net revenue (e.g. heavy rework expenses and extra labour)
    const lossResult = calculateProjectProfitability({
      orderId: 'ord-loss-1',
      orderNumber: 'SO-2026-0099',
      customerId: 'cust-2',
      customerName: 'Loss Project Ltd',
      status: 'INSTALLED',
      subtotalPaise: 20000000n,
      discountPaise: 0n, // Net revenue: 20,000,000 paise (₹2,00,000)
      stockMovements: [
        { type: 'DISPATCH', qty: 10, unitCostPaise: 1800000n }, // ₹1,80,000 materials
      ],
      timeLogs: [
        {
          startedAt: '2026-10-10T08:00:00Z',
          endedAt: '2026-10-10T18:00:00Z', // 10h @ ₹1,500/hr = ₹15,000
          hourlyCostPaise: 150000n,
        },
      ],
      expenses: [
        { amountPaise: 2500000n }, // ₹25,000 unexpected crane hire
      ],
    });

    // Net revenue: 20,000,000 paise
    // Materials: 18,000,000 paise
    // Labour: 1,500,000 paise
    // Expenses: 2,500,000 paise
    // Total cost: 22,000,000 paise
    // Profit: -2,000,000 paise (Loss of ₹20,000)
    assert.equal(lossResult.installProfitPaise, -2000000n);
    assert.equal(lossResult.isLoss, true, 'Loss-making project must have isLoss = true');
    assert.ok(lossResult.marginBp < 0, 'Margin basis points must be negative');
  });

  it('counts serialized unit cost ONCE in KPI material aggregation (FR-8.2 double-count fix)', () => {
    // Dispatch flow fixture: one bulk DISPATCH line movement covering 7 items
    // (avg cost Rs 1,000 each), then two per-unit DELIVERY movements for the
    // serialized units (already priced inside the DISPATCH line), plus one
    // serialized RETURN credit.
    const movements = [
      { type: 'DISPATCH', qty: 7, unit_cost_paise: 100000n, unit_id: null },
      { type: 'DELIVERY', qty: 1, unit_cost_paise: 100000n, unit_id: 'unit-1' },
      { type: 'DELIVERY', qty: 1, unit_cost_paise: 100000n, unit_id: 'unit-2' },
      { type: 'RETURN', qty: 1, unit_cost_paise: 50000n, unit_id: 'unit-3' },
    ];

    // Correct total: 7 x 100,000 (DISPATCH, counted once) - 50,000 (return)
    // = 650,000 paise. The DELIVERY rows must NOT add another 200,000.
    assert.equal(
      aggregateMaterialsCostPaise(movements),
      650000n,
      'Serialized DELIVERY movements with a unit_id must not double-count the DISPATCH cost'
    );
  });

  it('still counts bulk (non-serialized) DELIVERY movements in KPI material aggregation', () => {
    const movements = [
      { type: 'DELIVERY', qty: 3, unit_cost_paise: 200000n, unit_id: null },
    ];
    assert.equal(aggregateMaterialsCostPaise(movements), 600000n);
  });
});

describe('Phase 8 - IST Period Boundaries (Spec 6.3, TRD 2.4)', () => {
  it('correctly sets October 2026 boundary at 00:00:00 IST and 23:59:59.999 IST', () => {
    // October 2026 in IST (UTC+5:30):
    // Start: 2026-10-01 00:00:00.000 IST -> 2026-09-30 18:30:00.000 UTC
    // End:   2026-10-31 23:59:59.999 IST -> 2026-10-31 18:29:59.999 UTC
    const range = getISTMonthRange(2026, 10);

    assert.equal(
      range.start.toISOString(),
      '2026-09-30T18:30:00.000Z',
      'October 1st 00:00:00 IST must be 2026-09-30T18:30:00.000Z'
    );
    assert.equal(
      range.end.toISOString(),
      '2026-10-31T18:29:59.999Z',
      'October 31st 23:59:59.999 IST must be 2026-10-31T18:29:59.999Z'
    );
  });

  it('correctly bounds TODAY and comparison prior period in IST', () => {
    // Noon UTC on 31 Oct 2026 -> 17:30 IST on 31 Oct 2026
    const ref = new Date('2026-10-31T12:00:00.000Z');
    const dayRanges = getISTPeriodRanges('TODAY', undefined, undefined, ref);

    // Current day in IST: 31 Oct
    assert.equal(dayRanges.start.toISOString(), '2026-10-30T18:30:00.000Z');
    assert.equal(dayRanges.end.toISOString(), '2026-10-31T18:29:59.999Z');

    // Prior day in IST: 30 Oct
    assert.equal(dayRanges.priorStart.toISOString(), '2026-10-29T18:30:00.000Z');
    assert.equal(dayRanges.priorEnd.toISOString(), '2026-10-30T18:29:59.999Z');
  });
});

describe('Phase 8 - Predictive Maintenance & Alert Rules (Rule C12, Spec 2.4)', () => {
  it('triggers CLEANING_DUE alert when 90 or more days elapsed since installation or last cleaning', () => {
    const installDate = '2026-07-01'; // 122 days before 31 Oct 2026
    const refDate = new Date('2026-10-31T12:00:00Z');

    const alerts = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-clean-1',
        orderNumber: 'SO-100',
        customerName: 'Aarav Mehta',
        customerPhone: '+919876543210',
        systemType: 'ON_GRID',
        installedOn: installDate,
        lastCleaningOn: null,
        units: [],
      },
      refDate
    );

    const cleaningAlert = alerts.find((a) => a.rule === 'CLEANING_DUE');
    assert.ok(cleaningAlert, 'Must trigger CLEANING_DUE alert');
    assert.equal(cleaningAlert.riskScore, 25);
    assert.ok(cleaningAlert.reason.includes('90 days'));
  });

  it('triggers PRE_MONSOON check during the month of May', () => {
    const installDate = '2026-01-15';
    // 15 May 2026
    const mayDate = new Date('2026-05-15T10:00:00Z');

    const mayAlerts = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-monsoon-1',
        orderNumber: 'SO-101',
        customerName: 'Rohan Shah',
        customerPhone: '+919876543211',
        systemType: 'ON_GRID',
        installedOn: installDate,
        units: [],
      },
      mayDate
    );

    const preMonsoon = mayAlerts.find((a) => a.rule === 'PRE_MONSOON');
    assert.ok(preMonsoon, 'Must trigger PRE_MONSOON in May');
    assert.equal(preMonsoon.riskScore, 40);

    // October date must NOT trigger PRE_MONSOON
    const octDate = new Date('2026-10-31T10:00:00Z');
    const octAlerts = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-monsoon-1',
        orderNumber: 'SO-101',
        customerName: 'Rohan Shah',
        customerPhone: '+919876543211',
        systemType: 'ON_GRID',
        installedOn: installDate,
        units: [],
      },
      octDate
    );
    assert.equal(octAlerts.some((a) => a.rule === 'PRE_MONSOON'), false);
  });

  it('flags REPEAT_FAULT for units with 2 or more tickets in 90 days', () => {
    const refDate = new Date('2026-10-31T12:00:00Z');

    const alerts = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-fault-1',
        orderNumber: 'SO-102',
        customerName: 'Sneha Rao',
        customerPhone: '+919876543212',
        systemType: 'ON_GRID',
        installedOn: '2026-09-01',
        units: [
          {
            id: 'u-faulty',
            productId: 'p-inv',
            model: 'SunPower-3K',
            category: 'INVERTER',
            serialNumber: 'INV-2026-FAIL',
            ticketCountIn90Days: 2, // 2 tickets!
          },
          {
            id: 'u-healthy',
            productId: 'p-panel',
            model: 'SP-540',
            category: 'PANEL',
            serialNumber: 'PNL-2026-GOOD',
            ticketCountIn90Days: 0,
          },
        ],
      },
      refDate
    );

    const repeatFault = alerts.find((a) => a.rule === 'REPEAT_FAULT');
    assert.ok(repeatFault, 'Must flag repeat fault');
    assert.equal(repeatFault.unitId, 'u-faulty');
    assert.equal(repeatFault.riskScore, 75);
    assert.ok(repeatFault.reason.includes('senior technician'));
  });

  it('flags BATTERY_AGE on off-grid systems when battery age exceeds 18 months', () => {
    const refDate = new Date('2026-10-31T12:00:00Z');
    // Delivered 600 days ago (> 548 days / 18 months)
    const oldDelivery = new Date(refDate.getTime() - 600 * 24 * 3600 * 1000).toISOString();

    const alerts = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-bat-1',
        orderNumber: 'SO-103',
        customerName: 'Vikram Joshi',
        customerPhone: '+919876543213',
        systemType: 'OFF_GRID',
        installedOn: oldDelivery,
        units: [
          {
            id: 'u-bat-old',
            productId: 'p-bat-5kwh',
            model: 'PowerWall-5K',
            category: 'BATTERY',
            serialNumber: 'BAT-2025-001',
            deliveredOn: oldDelivery,
            ticketCountIn90Days: 0,
          },
        ],
      },
      refDate
    );

    const batAlert = alerts.find((a) => a.rule === 'BATTERY_AGE');
    assert.ok(batAlert, 'Must trigger BATTERY_AGE health check');
    assert.equal(batAlert.riskScore, 60);
  });

  it('triggers warranty ending alerts (60-day sales and 30-day customer reminder)', () => {
    const refDate = new Date('2026-10-31T12:00:00Z');

    // 1. Warranty ending in 45 days -> triggers sales alert (<= 60 days) but NOT customer reminder (> 30 days)
    const alerts45 = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-warr-45',
        orderNumber: 'SO-104',
        customerName: 'Priya Sharma',
        customerPhone: '+919876543214',
        systemType: 'ON_GRID',
        installedOn: '2025-11-01',
        units: [
          {
            id: 'u-warr-45',
            productId: 'p-inv-3k',
            model: 'SP-3K',
            category: 'INVERTER',
            serialNumber: 'INV-45D',
            ticketCountIn90Days: 0,
            activeWarranty: {
              id: 'w-45',
              endDate: '2026-12-15', // ~45 days away
            },
          },
        ],
      },
      refDate
    );
    assert.ok(alerts45.some((a) => a.rule === 'WARRANTY_EXPIRING_SALES'));
    assert.equal(alerts45.some((a) => a.rule === 'WARRANTY_REMINDER_CUSTOMER'), false);

    // 2. Warranty ending in 15 days -> triggers BOTH sales alert (<= 60 days) AND customer reminder (<= 30 days)
    const alerts15 = evaluateInstallationMaintenanceRules(
      {
        installationId: 'inst-warr-15',
        orderNumber: 'SO-105',
        customerName: 'Priya Sharma',
        customerPhone: '+919876543214',
        systemType: 'ON_GRID',
        installedOn: '2025-11-01',
        units: [
          {
            id: 'u-warr-15',
            productId: 'p-inv-3k',
            model: 'SP-3K',
            category: 'INVERTER',
            serialNumber: 'INV-15D',
            ticketCountIn90Days: 0,
            activeWarranty: {
              id: 'w-15',
              endDate: '2026-11-15', // ~15 days away
            },
          },
        ],
      },
      refDate
    );
    assert.ok(alerts15.some((a) => a.rule === 'WARRANTY_EXPIRING_SALES'));
    assert.ok(alerts15.some((a) => a.rule === 'WARRANTY_REMINDER_CUSTOMER'));
  });

  it('guarantees idempotency: running rules multiple times yields identical alert candidate keys', () => {
    const refDate = new Date('2026-10-31T12:00:00Z');
    const ctx = {
      installationId: 'inst-idempotent',
      orderNumber: 'SO-200',
      customerName: 'Test Idempotency',
      customerPhone: '+919000000000',
      systemType: 'ON_GRID' as const,
      installedOn: '2026-06-01',
      units: [
        {
          id: 'u-idem',
          productId: 'p-inv',
          model: 'SP-3K',
          category: 'INVERTER',
          serialNumber: 'INV-IDEM',
          ticketCountIn90Days: 2,
        },
      ],
    };

    const run1 = evaluateInstallationMaintenanceRules(ctx, refDate);
    const run2 = evaluateInstallationMaintenanceRules(ctx, refDate);

    // Keys [installationId, rule, dueOn] must be identical
    const keys1 = run1.map((a) => `${a.installationId}:${a.rule}:${a.dueOn}`).sort();
    const keys2 = run2.map((a) => `${a.installationId}:${a.rule}:${a.dueOn}`).sort();

    assert.deepEqual(keys1, keys2, 'Running maintenance evaluation twice must produce identical keys for unique constraint deduplication');
  });
});

describe('Phase 8 - Dashboard Share Link Token Security (Spec 6.3 Acceptance)', () => {
  it('generates verifiable read-only share link token and stops working after expiry', () => {
    const secret = 'test-secret-key-for-share-tokens-12345';

    // 1. Valid token (expires in 24 hours)
    const validLink = createDashboardShareToken('THIS_MONTH', 24, secret);
    const verified = verifyDashboardShareToken(validLink.token, secret);
    assert.equal(verified.period, 'THIS_MONTH');
    assert.equal(verified.isExpired, false);

    // 2. Expired token (duration -1 hour)
    const expiredLink = createDashboardShareToken('THIS_MONTH', -1, secret);
    assert.throws(
      () => verifyDashboardShareToken(expiredLink.token, secret),
      (err: any) => err.code === 'LINK_EXPIRED' && err.statusCode === 410,
      'Expired token must be rejected with 410 LINK_EXPIRED'
    );

    // 3. Tampered token
    const tamperedToken = validLink.token.slice(0, -4) + 'abcd';
    assert.throws(
      () => verifyDashboardShareToken(tamperedToken, secret),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403,
      'Tampered token must be rejected with 403 FORBIDDEN'
    );
  });
});

