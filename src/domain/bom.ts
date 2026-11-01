// BOM engine (TRD 2.4). generateBom returns priced lines from a template,
// capacity and survey cable distance. Five quantity rules:
//   FIXED            value
//   PANEL_COUNT      capacity W / panel Wp, rounded up
//   PER_PANEL        value x panel count
//   PER_KW           value x capacity kW, rounded up
//   PER_CABLE_METER  value x cable distance + allowance, rounded up

export type BomRule = 'FIXED' | 'PANEL_COUNT' | 'PER_PANEL' | 'PER_KW' | 'PER_CABLE_METER'

export interface BomProductInput {
  id: string
  name: string
  sku: string
  category: string
  isSerialized: boolean
  uom: string
  ratedPowerW?: number | null
  salePricePaise: number
  stdCostPaise: number
  taxRateBp: number
}

export interface BomTemplateLine {
  productId: string
  rule: BomRule
  value: number
  allowance?: number
  sortOrder?: number
}

export interface BomInput {
  capacityKw: number
  cableDistanceM?: number | null
  templateDefaultCableM: number
  panel?: BomProductInput | null
  /** system templates must yield an inverter; PANEL_SET/SERVICE templates may not */
  requireInverter?: boolean
}

export interface BomLine {
  productId: string
  name: string
  sku: string
  category: string
  uom: string
  isSerialized: boolean
  rule: BomRule
  qty: number
  unitPricePaise: number
  lineTotalPaise: number
  taxRateBp: number
  lineTaxPaise: number
  stdCostPaise: number
  lineCostPaise: number
  isManual: boolean
  manualReason?: string
}

export interface BomResult {
  lines: BomLine[]
  warnings: string[]
  panelCount: number
  installedKwp: number
  usedCableDistanceM: number
  hasInverter: boolean
  hasPanel: boolean
}

export function generateBom(
  products: Map<string, BomProductInput>,
  templateLines: BomTemplateLine[],
  input: BomInput
): BomResult {
  const warnings: string[] = []
  const panel = input.panel ?? null
  if (!panel) throw new Error('This template has no panel product configured.')

  const panelWp = panel.ratedPowerW ?? 540
  const panelCount = Math.ceil((input.capacityKw * 1000) / panelWp)
  if (panelCount < 1) throw new Error('Capacity too small: no panels would be needed.')

  let cableM = input.cableDistanceM ?? input.templateDefaultCableM
  if (input.cableDistanceM == null) {
    warnings.push('No surveyed cable distance yet, so the template default was used. Quantities may change after the survey.')
  }

  const lines: BomLine[] = []
  let hasPanel = false, hasInverter = false

  const sorted = [...templateLines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  for (const tl of sorted) {
    const product = products.get(tl.productId)
    if (!product) continue
    let qty = 0
    switch (tl.rule) {
      case 'FIXED':
        qty = tl.value
        break
      case 'PANEL_COUNT':
        qty = panelCount
        break
      case 'PER_PANEL':
        qty = tl.value * panelCount
        break
      case 'PER_KW':
        qty = Math.ceil(tl.value * input.capacityKw)
        break
      case 'PER_CABLE_METER':
        qty = Math.ceil(tl.value * cableM + (tl.allowance ?? 0))
        break
    }
    qty = Math.round(qty * 1000) / 1000
    if (qty <= 0) continue
    if (product.category === 'PANEL') hasPanel = true
    if (product.category === 'INVERTER') hasInverter = true
    const lineTotal = product.salePricePaise * qty
    lines.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      uom: product.uom,
      isSerialized: product.isSerialized,
      rule: tl.rule,
      qty,
      unitPricePaise: product.salePricePaise,
      lineTotalPaise: Math.round(lineTotal),
      taxRateBp: product.taxRateBp,
      lineTaxPaise: Math.round((lineTotal * product.taxRateBp) / 10000),
      stdCostPaise: product.stdCostPaise,
      lineCostPaise: Math.round(product.stdCostPaise * qty),
      isManual: false,
    })
  }

  if (!hasPanel) throw new Error('This template yields no solar panel. A solar engineer must fix the template before quoting.')
  // TRD 2.4: the engine rejects a SYSTEM template that yields no inverter.
  // Only explicitly partial templates (panel sets) are excused — a service
  // line must never mask a missing inverter.
  if (!hasInverter && lines.length > 0 && input.requireInverter !== false) {
    throw new Error('This template yields no inverter. A solar engineer must fix the template before quoting.')
  }

  return {
    lines,
    warnings,
    panelCount,
    installedKwp: Math.round((panelCount * panelWp) / 1000 * 100) / 100,
    usedCableDistanceM: cableM,
    hasInverter,
    hasPanel,
  }
}

/** Estimated margin (FR-3.8): net price - BOM standard cost - template labour allowance */
export function estimateMargin(
  subtotalPaise: number,
  discountPaise: number,
  lines: { lineCostPaise: number }[],
  labourAllowancePaise: number,
  targetMarginBp: number
): { marginBp: number; warning: boolean } {
  const net = subtotalPaise - discountPaise
  const cost = lines.reduce((s, l) => s + l.lineCostPaise, 0) + labourAllowancePaise
  const marginBp = net > 0 ? Math.round(((net - cost) / net) * 10000) : 0
  return { marginBp, warning: marginBp < targetMarginBp }
}
