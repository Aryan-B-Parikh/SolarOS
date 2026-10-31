import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSiteAssessment } from '../../src/domain/assessment.ts';
import { generateSiteAssessmentSummary, analyzeSurveyPhotos } from '../../src/lib/ai.ts';

describe('Phase 2 - Site Assessment Service Integration (TRD 2.4 / Screen S4)', () => {
  it('identifies roof area conflict when usable area cannot fit required capacity', () => {
    // 5 kW required by high bill (Rs 6,000), but only 20 m² roof area -> caps at 2 kW
    const result = calculateSiteAssessment({
      monthlyBillRs: 6000,
      tariffRsPerKwh: 7,
      usableRoofAreaM2: 20,
    });

    const flags: string[] = [];
    if (result.roofCapacityLimitKw && result.requiredCapacityKw > result.roofCapacityLimitKw) {
      flags.push(`ROOF_AREA_CONSTRAINT: Required ${result.requiredCapacityKw} kW capped at ${result.roofCapacityLimitKw} kW by roof space.`);
    }

    assert.equal(flags.length, 1);
    assert.ok(flags[0].includes('ROOF_AREA_CONSTRAINT'));
  });

  it('generates zero-PII AI summary with fallback and prompt version', async () => {
    const aiSummary = await generateSiteAssessmentSummary({
      recommendedCapacityKw: 3,
      yearlyGenerationKwh: 4928,
      yearlySavingsRs: 34493,
      monthlyUnitsKwh: 429,
      shadingLevel: 'NONE',
    });

    assert.equal(aiSummary.promptVersion, '1.1.0');
    assert.ok(aiSummary.summary.includes('3 kW'));
    assert.ok(aiSummary.summary.includes('34,493'));
    assert.equal(aiSummary.fallbackUsed, true); // Fallback used gracefully without API key
  });

  it('runs advisory photo analysis and tags observations as strictly advisory', async () => {
    const findings = await analyzeSurveyPhotos(['https://storage.sunpower.in/surveys/roof1.jpg']);
    assert.equal(findings.isAdvisory, true);
    assert.equal(findings.fallbackUsed, true);
    assert.deepEqual(findings.shadingSources, ['Not analysed']);
  });
});

