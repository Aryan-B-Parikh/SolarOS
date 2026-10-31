/**
 * SunPower Ops - Site Assessment Calculator Engine
 * Specification Reference: TRD 2.4, PRD 1.6, Implementation Plan Phase 2
 *
 * Rules:
 * 1. Pure function with zero external side-effects or DB dependencies.
 * 2. Inputs: Monthly bill or Monthly units, Tariff, Usable roof area, Shading factor, Sanctioned load.
 * 3. Default Constants:
 *    - Yield: 4.5 kWh per kWp per day
 *    - Roof area per kW: 10 m2 shadow-free area
 *    - Shading factors: None (1.00), Low (0.95), Medium (0.85), High (0.70)
 *    - Default Tariff: Rs 7 per kWh
 * 4. Worked example in TRD 2.4:
 *    - Rs 3,000 bill @ Rs 7/kWh (~429 units/month, 5,143 units/year)
 *    - None shading -> 3.13 kW required -> recommended 3 kW
 *    - 4,928 kWh/year, Rs 34,493/year savings (~Rs 34,500)
 * 5. All outputs are explicitly marked as isEstimate: true.
 */

export type ShadingLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface AssessmentSettings {
  defaultTariffRsPerKwh?: number;
  yieldPerKwpPerDay?: number;
  roofAreaM2PerKw?: number;
  shadingFactors?: Record<ShadingLevel, number>;
}

export const DEFAULT_ASSESSMENT_SETTINGS: Required<AssessmentSettings> = {
  defaultTariffRsPerKwh: 7,
  yieldPerKwpPerDay: 4.5,
  roofAreaM2PerKw: 10,
  shadingFactors: {
    NONE: 1.00,
    LOW: 0.95,
    MEDIUM: 0.85,
    HIGH: 0.70,
  },
};

export interface AssessmentInput {
  monthlyBillRs?: number;
  monthlyUnitsKwh?: number;
  tariffRsPerKwh?: number;
  usableRoofAreaM2?: number;
  shadingLevel?: ShadingLevel;
  shadingFactor?: number;
  sanctionedLoadKw?: number;
  quoteTotalRs?: number;
  subsidyEstimateRs?: number;
}

export interface AssessmentResult {
  monthlyUnitsKwh: number;
  yearlyUnitsKwh: number;
  requiredCapacityKw: number;
  recommendedCapacityKw: number;
  installedCapacityKwp: number;
  panelCount: number;
  panelRatedWp: number;
  yearlyGenerationKwh: number;
  yearlySavingsRs: number;
  paybackYears: number | null;
  roofCapacityLimitKw: number | null;
  sanctionedLoadLimitKw: number | null;
  shadingFactorApplied: number;
  isEstimate: true;
  label: 'Estimate';
  disclaimer: string;
}

/**
 * Standard 540 Wp panels used for calculating installed system capacity.
 * For example: 3 kW package = 6 panels x 540 Wp = 3.24 kWp.
 */
export const STANDARD_PANEL_RATED_WP = 540;

/**
 * Pure calculator function sizing system and estimated savings.
 */
export function calculateSiteAssessment(
  input: AssessmentInput,
  settings: AssessmentSettings = {}
): AssessmentResult {
  const mergedSettings = { ...DEFAULT_ASSESSMENT_SETTINGS, ...settings };

  const tariff = input.tariffRsPerKwh && input.tariffRsPerKwh > 0
    ? input.tariffRsPerKwh
    : mergedSettings.defaultTariffRsPerKwh;

  let monthlyUnits = 0;
  if (input.monthlyUnitsKwh !== undefined && input.monthlyUnitsKwh > 0) {
    monthlyUnits = input.monthlyUnitsKwh;
  } else if (input.monthlyBillRs !== undefined && input.monthlyBillRs > 0) {
    monthlyUnits = input.monthlyBillRs / tariff;
  } else {
    throw new Error('Either monthlyBillRs or monthlyUnitsKwh must be provided and greater than 0');
  }

  const yearlyUnits = monthlyUnits * 12;

  let shadingFactor = mergedSettings.shadingFactors.NONE;
  if (input.shadingFactor !== undefined && input.shadingFactor > 0 && input.shadingFactor <= 1.0) {
    shadingFactor = input.shadingFactor;
  } else if (input.shadingLevel && mergedSettings.shadingFactors[input.shadingLevel]) {
    shadingFactor = mergedSettings.shadingFactors[input.shadingLevel];
  }

  const dailyYield = mergedSettings.yieldPerKwpPerDay;
  const annualYieldFactor = dailyYield * 365 * shadingFactor;

  // required kW = (monthly units * 12) / (yield * 365 * shading factor)
  const requiredCapacityKw = yearlyUnits / annualYieldFactor;

  // Recommended capacity = required kW rounded to nearest package (1 to 5 kW)
  let recommendedCapacityKw = Math.round(requiredCapacityKw);
  if (recommendedCapacityKw < 1) recommendedCapacityKw = 1;
  if (recommendedCapacityKw > 5) recommendedCapacityKw = 5;

  let roofLimitKw: number | null = null;
  if (input.usableRoofAreaM2 !== undefined && input.usableRoofAreaM2 > 0) {
    roofLimitKw = Math.floor(input.usableRoofAreaM2 / mergedSettings.roofAreaM2PerKw);
    if (recommendedCapacityKw > roofLimitKw) {
      recommendedCapacityKw = Math.max(1, roofLimitKw);
    }
  }

  let sanctionedLimitKw: number | null = null;
  if (input.sanctionedLoadKw !== undefined && input.sanctionedLoadKw > 0) {
    sanctionedLimitKw = Math.floor(input.sanctionedLoadKw);
    if (recommendedCapacityKw > sanctionedLimitKw) {
      recommendedCapacityKw = Math.max(1, sanctionedLimitKw);
    }
  }

  // Panel sizing: 3000 W / 540 Wp = 5.55 -> 6 panels; capacity = 6 * 540 = 3.24 kWp
  const targetWatts = recommendedCapacityKw * 1000;
  const panelCount = Math.ceil(targetWatts / STANDARD_PANEL_RATED_WP);
  const installedCapacityKwp = Number(((panelCount * STANDARD_PANEL_RATED_WP) / 1000).toFixed(2));

  // Yearly generation = kW * yield * 365 * shading factor
  const exactYearlyGeneration = recommendedCapacityKw * annualYieldFactor;
  const yearlyGenerationKwh = Math.round(exactYearlyGeneration);

  // Yearly savings = min(generation, consumption) * tariff, ignoring export credit
  const exactYearlySavings = Math.min(exactYearlyGeneration, yearlyUnits) * tariff;
  const yearlySavingsRs = Math.round(exactYearlySavings);

  // Payback = (quote total - subsidy estimate) / yearly savings
  let paybackYears: number | null = null;
  if (input.quoteTotalRs !== undefined && input.quoteTotalRs > 0 && yearlySavingsRs > 0) {
    const netCost = input.quoteTotalRs - (input.subsidyEstimateRs ?? 0);
    if (netCost > 0) {
      paybackYears = Number((netCost / yearlySavingsRs).toFixed(1));
    }
  }

  return {
    monthlyUnitsKwh: Number(monthlyUnits.toFixed(2)),
    yearlyUnitsKwh: Number(yearlyUnits.toFixed(2)),
    requiredCapacityKw: Number(requiredCapacityKw.toFixed(2)),
    recommendedCapacityKw,
    installedCapacityKwp,
    panelCount,
    panelRatedWp: STANDARD_PANEL_RATED_WP,
    yearlyGenerationKwh,
    yearlySavingsRs,
    paybackYears,
    roofCapacityLimitKw: roofLimitKw,
    sanctionedLoadLimitKw: sanctionedLimitKw,
    shadingFactorApplied: shadingFactor,
    isEstimate: true,
    label: 'Estimate',
    disclaimer: 'All figures are estimates. Actual generation and savings depend on roof orientation, shading, grid availability and seasonal weather patterns.',
  };
}

