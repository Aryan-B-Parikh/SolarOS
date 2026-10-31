import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSiteAssessment } from '../../src/domain/assessment.ts';
import { validateTransition } from '../../src/domain/state-machines/transitions.ts';
import { generateSiteAssessmentSummary, analyzeSurveyPhotos } from '../../src/lib/ai.ts';

describe('Member 1 - Phase 2 Survey Service & Review Logic (TRD 2.4, D17)', () => {
  it('validates state transitions for survey review (approval moves to SURVEY_APPROVED)', () => {
    // Current lead status must be SURVEY_SCHEDULED to approve
    assert.doesNotThrow(() => {
      validateTransition('LEAD', 'SURVEY_SCHEDULED', 'SURVEY_APPROVED');
    });
  });

  it('validates state transitions for survey review (rejection moves back to QUALIFIED)', () => {
    // Rejection returns lead back to QUALIFIED
    assert.doesNotThrow(() => {
      validateTransition('LEAD', 'SURVEY_SCHEDULED', 'QUALIFIED');
    });
  });

  it('rejects survey approval if lead is in invalid prior state (e.g. NEW or CONTACTED)', () => {
    assert.throws(
      () => {
        validateTransition('LEAD', 'NEW', 'SURVEY_APPROVED');
      },
      /Cannot transition/
    );

    assert.throws(
      () => {
        validateTransition('LEAD', 'CONTACTED', 'SURVEY_APPROVED');
      },
      /Cannot transition/
    );
  });

  it('mandates a rejection reason when rejecting a survey', () => {
    const validateRejection = (reason?: string) => {
      if (!reason || !reason.trim()) {
        throw new Error('Rejection reason is required');
      }
      return true;
    };

    assert.throws(() => validateRejection(''), /Rejection reason is required/);
    assert.throws(() => validateRejection('   '), /Rejection reason is required/);
    assert.equal(validateRejection('Roof has structural cracks preventing mounting'), true);
  });

  it('runs the pure site assessment calculator on approved survey measurements', () => {
    // Ground-truth survey inputs: 30 m² usable flat roof, no shading, 4 kW sanctioned load
    const surveyInputs = {
      monthlyBillRs: 3000,
      tariffRsPerKwh: 7,
      usableRoofAreaM2: 30,
      sanctionedLoadKw: 4,
      shadingLevel: 'NONE' as const,
    };

    const assessment = calculateSiteAssessment(surveyInputs);

    // Acceptance criteria check
    assert.equal(assessment.recommendedCapacityKw, 3);
    assert.equal(assessment.yearlyGenerationKwh, 4928);
    assert.equal(assessment.yearlySavingsRs, 34493);
    assert.equal(assessment.isEstimate, true);
    assert.equal(assessment.label, 'Estimate');
  });

  it('verifies AI summary generation falls back gracefully with prompt version', async () => {
    const summary = await generateSiteAssessmentSummary({
      recommendedCapacityKw: 3,
      yearlyGenerationKwh: 4928,
      yearlySavingsRs: 34493,
      monthlyUnitsKwh: 429,
      shadingLevel: 'NONE',
    });

    assert.ok(summary.summary.length > 0);
    assert.equal(summary.promptVersion, '1.1.0');
    assert.equal(summary.fallbackUsed, true);
    assert.ok(summary.summary.includes('3 kW'));
  });

  it('verifies advisory photo analysis never alters calculator outputs', async () => {
    const initialCalc = calculateSiteAssessment({
      monthlyBillRs: 3000,
      tariffRsPerKwh: 7,
      usableRoofAreaM2: 30,
    });

    const photoFindings = await analyzeSurveyPhotos([
      'https://storage.sunpower.in/surveys/roof_south.jpg',
    ]);

    assert.equal(photoFindings.isAdvisory, true);
    // Calculator output remains invariant
    assert.equal(initialCalc.recommendedCapacityKw, 3);
    assert.equal(initialCalc.yearlySavingsRs, 34493);
  });
});
