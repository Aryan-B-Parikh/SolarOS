// Site assessment calculator (TRD 2.4). All outputs are Estimates (A8):
// constants are settings until calibrated with real generation data.
//
// Worked example: Rs 3,000 bill at Rs 7/kWh -> ~429 units/month (5,143/yr);
// required kW = 5143 / (4.5 x 365 x 1.0) = 3.13 -> recommend 3 kW;
// generation = 3 x 4.5 x 365 = 4,928 kWh/yr; savings = min(gen, consumption) x 7 = Rs 34,493.

export interface AssessmentInput {
  monthlyBillPaise?: number | null
  monthlyUnits?: number | null
  tariffPaise: number
  roofAreaSqm: number
  shading: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
  sanctionedLoadKw?: number | null
  requestedCapacityKw?: number | null
  yieldKwhPerKwpPerDay: number
  roofAreaPerKwSqm: number
  shadingFactors: Record<string, number>
}

export interface AssessmentResult {
  monthlyUnits: number
  annualUnits: number
  requiredKw: number
  recommendedKw: number
  recommendedType: 'ON_GRID' | 'OFF_GRID'
  roofLimitKw: number
  loadLimitKw: number | null
  annualGenerationKwh: number
  annualSavingsPaise: number
  paybackYears: number | null
  flags: string[] // ROOF_TOO_SMALL, ABOVE_SANCTIONED_LOAD, HEAVY_SHADING, BILL_ONLY_ESTIMATE
  notes: string[]
}

export function calculateAssessment(input: AssessmentInput): AssessmentResult {
  const flags: string[] = []
  const notes: string[] = []

  let monthlyUnits = input.monthlyUnits ?? 0
  if (!input.monthlyUnits && input.monthlyBillPaise && input.tariffPaise > 0) {
    monthlyUnits = input.monthlyBillPaise / input.tariffPaise
    notes.push('Monthly consumption was derived from the bill amount and tariff (estimate).')
  }
  const annualUnits = monthlyUnits * 12
  const shadeFactor = input.shadingFactors[input.shading] ?? 1.0
  if (input.shading === 'HIGH') flags.push('HEAVY_SHADING')

  const denom = input.yieldKwhPerKwpPerDay * 365 * shadeFactor
  const requiredKw = denom > 0 ? annualUnits / denom : 0

  // snap to the nearest package (1..5 kW)
  const packages = [1, 2, 3, 4, 5]
  let recommendedKw = packages.reduce((best, p) =>
    Math.abs(p - requiredKw) < Math.abs(best - requiredKw) ? p : best
  , 1)
  const requested = input.requestedCapacityKw
  if (requested && packages.includes(requested)) recommendedKw = requested

  const roofLimitKw = input.roofAreaPerKwSqm > 0 ? Math.floor((input.roofAreaSqm / input.roofAreaPerKwSqm) * 100) / 100 : 0
  if (recommendedKw > roofLimitKw) {
    flags.push('ROOF_TOO_SMALL')
    recommendedKw = Math.max(1, Math.min(recommendedKw, Math.floor(roofLimitKw)))
  }

  let loadLimitKw: number | null = null
  if (input.sanctionedLoadKw && input.sanctionedLoadKw > 0) {
    loadLimitKw = input.sanctionedLoadKw
    if (recommendedKw > input.sanctionedLoadKw) {
      flags.push('ABOVE_SANCTIONED_LOAD')
      recommendedKw = Math.max(1, Math.min(recommendedKw, Math.floor(input.sanctionedLoadKw)))
    }
  }

  const annualGenerationKwh = Math.round(recommendedKw * input.yieldKwhPerKwpPerDay * 365 * shadeFactor * 10) / 10
  const billableUnits = Math.min(annualGenerationKwh, annualUnits)
  const annualSavingsPaise = Math.round(billableUnits * input.tariffPaise)
  notes.push('Export credit is ignored, so savings are conservative.')

  return {
    monthlyUnits: Math.round(monthlyUnits * 10) / 10,
    annualUnits: Math.round(annualUnits),
    requiredKw: Math.round(requiredKw * 100) / 100,
    recommendedKw,
    recommendedType: 'ON_GRID',
    roofLimitKw,
    loadLimitKw,
    annualGenerationKwh,
    annualSavingsPaise,
    paybackYears: null, // filled by the service when a quote total exists
    flags,
    notes,
  }
}

/** Payback = (quote total - subsidy estimate) / yearly savings */
export function paybackYears(quoteTotalPaise: number, subsidyEstimatePaise: number, annualSavingsPaise: number): number | null {
  if (annualSavingsPaise <= 0) return null
  return Math.round(((quoteTotalPaise - subsidyEstimatePaise) / annualSavingsPaise) * 10) / 10
}
