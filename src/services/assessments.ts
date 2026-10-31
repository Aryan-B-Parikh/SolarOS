/**
 * SunPower Ops - Site Assessment Service
 * Specification Reference: TRD 2.4, PRD 1.6, Implementation Plan Phase 2
 *
 * Rules:
 * 1. Pure calculator produces all figures (kW, generation, savings, payback).
 * 2. LLM layer receives only numbers and technical survey inputs (NO customer PII).
 * 3. 8-second timeout guard with deterministic fallback summary.
 * 4. Model ID and prompt version are stored on site_assessments.
 * 5. Photo analysis is advisory only: never alters calculator numbers or survey approval.
 */

import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import {
  calculateSiteAssessment,
  AssessmentInput,
  AssessmentResult,
  ShadingLevel,
} from '@/domain/assessment';
import {
  generateSiteAssessmentSummary,
  generateFallbackSummary,
  analyzeSurveyPhotos,
  generateFallbackPhotoAnalysis,
  AiAssessmentInput,
  PhotoAnalysisResult,
  AI_PROMPT_VERSION,
  DEFAULT_AI_MODEL,
} from '@/lib/ai';
import { rupeesToPaise } from '@/lib/money';
import { isAiAssessmentEnabled } from '@/services/settings';

export interface RunAssessmentOptions {
  monthlyBillRs?: number;
  monthlyUnitsKwh?: number;
  tariffRsPerKwh?: number;
  usableRoofAreaM2?: number;
  shadingLevel?: ShadingLevel;
  sanctionedLoadKw?: number;
  quoteTotalRs?: number;
  subsidyEstimateRs?: number;
  apiKey?: string;
}

export async function runLeadAssessment(
  leadId: string,
  options: RunAssessmentOptions = {},
  actorId?: string
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      survey: true,
      customer: true,
    },
  });

  if (!lead) {
    throw new AppError('NOT_FOUND', 'Lead not found', 404);
  }

  // 1. Resolve inputs: survey measurements take precedence, falling back to lead fields, then defaults
  const survey = lead.survey;

  const monthlyBillRs =
    options.monthlyBillRs !== undefined
      ? options.monthlyBillRs
      : lead.monthly_bill_paise
      ? Number(lead.monthly_bill_paise) / 100
      : undefined;

  const tariffRsPerKwh =
    options.tariffRsPerKwh !== undefined
      ? options.tariffRsPerKwh
      : lead.tariff_paise
      ? Number(lead.tariff_paise) / 100
      : 7;

  const usableRoofAreaM2 =
    options.usableRoofAreaM2 !== undefined
      ? options.usableRoofAreaM2
      : survey?.usable_area_sqm
      ? Number(survey.usable_area_sqm)
      : lead.roof_area_sqm
      ? Number(lead.roof_area_sqm)
      : undefined;

  const shadingLevel: ShadingLevel =
    options.shadingLevel ||
    (survey?.shading as ShadingLevel) ||
    'NONE';

  const sanctionedLoadKw =
    options.sanctionedLoadKw !== undefined
      ? options.sanctionedLoadKw
      : lead.sanctioned_load_kw
      ? Number(lead.sanctioned_load_kw)
      : undefined;

  const calcInput: AssessmentInput = {
    monthlyBillRs,
    monthlyUnitsKwh: options.monthlyUnitsKwh,
    tariffRsPerKwh,
    usableRoofAreaM2,
    shadingLevel,
    sanctionedLoadKw,
    quoteTotalRs: options.quoteTotalRs || 180000,
    subsidyEstimateRs: options.subsidyEstimateRs || (lead.wants_subsidy ? 78000 : 0),
  };

  // 2. Pure Calculator Execution (TRD 2.4)
  const calcResult: AssessmentResult = calculateSiteAssessment(calcInput);

  // 3. Flags Generation (Conflict & sizing warnings)
  const flags: string[] = [];
  if (calcResult.roofCapacityLimitKw && calcResult.requiredCapacityKw > calcResult.roofCapacityLimitKw) {
    flags.push(`ROOF_AREA_CONSTRAINT: Required ${calcResult.requiredCapacityKw} kW capped at ${calcResult.roofCapacityLimitKw} kW by roof space.`);
  }
  if (calcResult.sanctionedLoadLimitKw && calcResult.requiredCapacityKw > calcResult.sanctionedLoadLimitKw) {
    flags.push(`SANCTIONED_LOAD_CONSTRAINT: Sizing capped at ${calcResult.sanctionedLoadLimitKw} kW by utility sanctioned load.`);
  }
  if (shadingLevel === 'HIGH' || shadingLevel === 'MEDIUM') {
    flags.push(`SHADING_WARNING: ${shadingLevel} shading reduces annual yield factor.`);
  }

  // 4. AI Customer Summary Generation (Strict Zero-PII)
  const aiInput: AiAssessmentInput = {
    recommendedCapacityKw: calcResult.recommendedCapacityKw,
    yearlyGenerationKwh: calcResult.yearlyGenerationKwh,
    yearlySavingsRs: calcResult.yearlySavingsRs,
    monthlyUnitsKwh: calcResult.monthlyUnitsKwh,
    usableRoofAreaM2,
    shadingLevel,
    roofType: survey?.roof_type,
    roofDirection: survey?.azimuth_deg ? `${survey.azimuth_deg}°` : undefined,
    roofTiltDeg: survey?.tilt_deg,
    cableDistanceM: survey?.cable_distance_m ? Number(survey.cable_distance_m) : undefined,
  };

  // 4. AI Customer Summary Generation (Strict Zero-PII).
  // FR-2.7: the Gemini call is gated behind the `ai_assessment_enabled`
  // setting (default FALSE) - when disabled we use the deterministic
  // templated fallback so no external AI call is ever made.
  const aiEnabled = await isAiAssessmentEnabled();
  const aiResult = aiEnabled
    ? await generateSiteAssessmentSummary(aiInput, options.apiKey)
    : generateFallbackSummary(aiInput);

  // 5. Persist Assessment in Database
  const annualSavingsPaise = rupeesToPaise(calcResult.yearlySavingsRs);
  const paybackYears = calcResult.paybackYears ?? 4.0;

  const assessment = await prisma.siteAssessment.upsert({
    where: { lead_id: leadId },
    create: {
      lead_id: leadId,
      survey_id: survey?.id || null,
      inputs: {
        ...calcInput,
        panelCount: calcResult.panelCount,
        installedCapacityKwp: calcResult.installedCapacityKwp,
      } as any,
      recommended_kw: calcResult.recommendedCapacityKw,
      recommended_type: lead.system_type_pref === 'OFF_GRID' ? 'OFF_GRID' : 'ON_GRID',
      annual_generation_kwh: calcResult.yearlyGenerationKwh,
      annual_savings_paise: annualSavingsPaise,
      payback_years: paybackYears,
      flags,
      ai_summary: aiResult.summary,
      ai_risks: aiResult.risks as any,
      ai_model: aiResult.modelId || DEFAULT_AI_MODEL,
      prompt_version: aiResult.promptVersion || AI_PROMPT_VERSION,
    },
    update: {
      survey_id: survey?.id || null,
      inputs: {
        ...calcInput,
        panelCount: calcResult.panelCount,
        installedCapacityKwp: calcResult.installedCapacityKwp,
      } as any,
      recommended_kw: calcResult.recommendedCapacityKw,
      recommended_type: lead.system_type_pref === 'OFF_GRID' ? 'OFF_GRID' : 'ON_GRID',
      annual_generation_kwh: calcResult.yearlyGenerationKwh,
      annual_savings_paise: annualSavingsPaise,
      payback_years: paybackYears,
      flags,
      ai_summary: aiResult.summary,
      ai_risks: aiResult.risks as any,
      ai_model: aiResult.modelId || DEFAULT_AI_MODEL,
      prompt_version: aiResult.promptVersion || AI_PROMPT_VERSION,
    },
  });

  // Audit Logging
  await recordAudit(
    {
      actorType: actorId ? 'USER' : 'SYSTEM',
      actorId,
      entityType: 'SITE_ASSESSMENT',
      entityId: assessment.id,
      action: 'ASSESSMENT_GENERATED',
      after: {
        recommendedKw: calcResult.recommendedCapacityKw,
        annualGenerationKwh: calcResult.yearlyGenerationKwh,
        annualSavingsRs: calcResult.yearlySavingsRs,
        fallbackUsed: aiResult.fallbackUsed,
      },
    },
    prisma
  );

  return {
    ...assessment,
    calculatorDetails: calcResult,
    aiDetails: aiResult,
  };
}

export async function runSurveyPhotoAnalysis(
  surveyId: string,
  photoUrls: string[] = [],
  apiKey?: string,
  actorId?: string
) {
  const survey = await prisma.siteSurvey.findUnique({
    where: { id: surveyId },
    include: { lead: true },
  });

  if (!survey) {
    throw new AppError('NOT_FOUND', 'Site survey not found', 404);
  }

  // FR-2.7: vision calls are gated behind `ai_assessment_enabled`
  // (default FALSE). When disabled we return the deterministic
  // "Not analysed" advisory fallback without touching Gemini.
  const aiEnabled = await isAiAssessmentEnabled();

  // Vision model advisory findings (strictly advisory, never alters numbers)
  const findings: PhotoAnalysisResult = aiEnabled
    ? await analyzeSurveyPhotos(photoUrls, apiKey)
    : generateFallbackPhotoAnalysis();

  // Attach findings to the lead's site_assessment
  const assessment = await prisma.siteAssessment.findUnique({
    where: { lead_id: survey.lead_id },
  });

  if (assessment) {
    await prisma.siteAssessment.update({
      where: { id: assessment.id },
      data: {
        photo_findings: findings as any,
        photo_model: findings.fallbackUsed ? 'system-template-fallback' : 'gemini-1.5-flash-vision',
      },
    });
  }

  await recordAudit(
    {
      actorType: actorId ? 'USER' : 'SYSTEM',
      actorId,
      entityType: 'SITE_SURVEY',
      entityId: survey.id,
      action: 'PHOTO_ANALYSIS_EXECUTED',
      after: {
        isAdvisory: true,
        photoQuality: findings.photoQuality,
        aiEnabled,
        fallbackUsed: findings.fallbackUsed,
      },
    },
    prisma
  );

  return findings;
}

export async function getLeadAssessment(leadId: string) {
  const assessment = await prisma.siteAssessment.findUnique({
    where: { lead_id: leadId },
    include: {
      survey: true,
      lead: {
        include: {
          customer: true,
        },
      },
    },
  });

  return assessment;
}

