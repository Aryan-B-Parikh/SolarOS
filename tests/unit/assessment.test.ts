import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSiteAssessment } from '../../src/domain/assessment.ts';

describe('Site Assessment Calculator Engine (TRD 2.4, Phase 2)', () => {
  it('passes the worked example from the specification (3 kW, 4,928 kWh, Rs 34,493)', () => {
    // Spec worked example: Rs 3,000 monthly bill at Rs 7 per kWh, shading None (1.00)
    const result = calculateSiteAssessment({
      monthlyBillRs: 3000,
      tariffRsPerKwh: 7,
      shadingLevel: 'NONE',
    });

    // Phase 2 Acceptance: returns 3 kW, 4,928 kWh and Rs 34,493 (each to within 1)
    assert.equal(result.recommendedCapacityKw, 3, 'Recommended capacity must be 3 kW');
    assert.ok(
      Math.abs(result.yearlyGenerationKwh - 4928) <= 1,
      `Yearly generation ${result.yearlyGenerationKwh} should be 4928 within 1`
    );
    assert.ok(
      Math.abs(result.yearlySavingsRs - 34493) <= 1,
      `Yearly savings ${result.yearlySavingsRs} should be 34493 within 1`
    );

    // Verify system sizing details: 6 panels x 540 Wp = 3.24 kWp
    assert.equal(result.panelCount, 6, '3 kW system must use 6 panels');
    assert.equal(result.installedCapacityKwp, 3.24, '6 x 540 Wp should be 3.24 kWp');

    // Rule: All outputs labelled Estimate [v1.1]
    assert.equal(result.isEstimate, true);
    assert.equal(result.label, 'Estimate');
  });

  it('caps capacity at the roof limit (usable area / 10 m²)', () => {
    // 5 kW required by consumption, but only 20 m² roof area available -> cap at 2 kW
    const result = calculateSiteAssessment({
      monthlyBillRs: 6000,
      tariffRsPerKwh: 7,
      usableRoofAreaM2: 20, // 20 m² / 10 = 2 kW
    });

    assert.equal(result.recommendedCapacityKw, 2, 'Should be capped at roof limit of 2 kW');
    assert.equal(result.roofCapacityLimitKw, 2);
  });

  it('caps capacity at sanctioned load limit', () => {
    // 5 kW required by bill, but sanctioned load is 2 kW
    const result = calculateSiteAssessment({
      monthlyBillRs: 6000,
      tariffRsPerKwh: 7,
      sanctionedLoadKw: 2,
    });

    assert.equal(result.recommendedCapacityKw, 2, 'Should be capped at sanctioned load of 2 kW');
    assert.equal(result.sanctionedLoadLimitKw, 2);
  });

  it('calculates payback correctly when quote total and subsidy are provided', () => {
    const result = calculateSiteAssessment({
      monthlyBillRs: 3000,
      tariffRsPerKwh: 7,
      quoteTotalRs: 180000,
      subsidyEstimateRs: 78000,
    });

    // Net cost = 180,000 - 78,000 = 102,000. Yearly savings = 34,493. Payback = 102,000 / 34,493 = ~2.96 -> 3.0 years
    assert.ok(result.paybackYears !== null);
    assert.ok(result.paybackYears >= 2.8 && result.paybackYears <= 3.1);
  });

  it('applies shading factor correctly (High shading reduces annual generation)', () => {
    const noShading = calculateSiteAssessment({
      monthlyBillRs: 3000,
      tariffRsPerKwh: 7,
      shadingLevel: 'NONE',
    });

    const highShading = calculateSiteAssessment({
      monthlyBillRs: 3000,
      tariffRsPerKwh: 7,
      shadingLevel: 'HIGH', // 0.70
    });

    assert.equal(highShading.shadingFactorApplied, 0.70);
    assert.ok(highShading.yearlyGenerationKwh < noShading.yearlyGenerationKwh);
  });
});

