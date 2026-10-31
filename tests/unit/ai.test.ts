import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSiteAssessmentSummary,
  generateFallbackSummary,
  generateFallbackPhotoAnalysis,
  analyzeSurveyPhotos,
  AI_PROMPT_VERSION,
} from '../../src/lib/ai.ts';

describe('AI Site Assessment Summary & Vision Client (TRD 2.4, Phase 2)', () => {
  it('generates deterministic fallback summary without API key', async () => {
    const summary = await generateSiteAssessmentSummary({
      recommendedCapacityKw: 3,
      yearlyGenerationKwh: 4928,
      yearlySavingsRs: 34493,
      monthlyUnitsKwh: 429,
      shadingLevel: 'LOW',
      usableRoofAreaM2: 30,
    });

    assert.equal(summary.fallbackUsed, true);
    assert.equal(summary.promptVersion, AI_PROMPT_VERSION);
    assert.ok(summary.summary.includes('3 kW system is recommended'));
    assert.ok(summary.summary.includes('4,928 kWh'));
    assert.ok(summary.summary.includes('34,493'));
    assert.ok(summary.summary.includes('Your roof measurements and sanctioned load should be verified'));
    assert.ok(summary.risks.length > 0);
  });

  it('flags shading risk when shading is reported', () => {
    const summary = generateFallbackSummary({
      recommendedCapacityKw: 3,
      yearlyGenerationKwh: 4928,
      yearlySavingsRs: 34493,
      monthlyUnitsKwh: 429,
      shadingLevel: 'MEDIUM',
    });

    const hasShadingRisk = summary.risks.some((r) => r.toLowerCase().includes('shading'));
    assert.equal(hasShadingRisk, true, 'Should flag medium shading risk in summary');
  });

  it('provides safe advisory photo analysis fallback', async () => {
    const photoResult = await analyzeSurveyPhotos([]);

    assert.equal(photoResult.isAdvisory, true);
    assert.equal(photoResult.fallbackUsed, true);
    assert.deepEqual(photoResult.shadingSources, ['Not analysed']);
  });
});

