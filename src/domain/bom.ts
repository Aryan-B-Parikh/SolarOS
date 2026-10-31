/**
 * SunPower Ops - Deterministic BOM Engine (FR-3.1, TRD 2.4, ADR D7)
 * Generates exact bill of materials lines from a SystemTemplate and site parameters.
 */

export type BomRule = 'FIXED' | 'PANEL_COUNT' | 'PER_PANEL' | 'PER_KW' | 'PER_CABLE_METER' | 'MANUAL';

export interface BomInput {
  capacityKw: number;
  cableDistanceM?: number;
  panelRatedWp?: number;
}

export interface TemplateLineData {
  id: string;
  product_id: string;
  rule: BomRule;
  value: number; // e.g. 1, 2, 6
  allowance: number; // e.g. 5m for cables
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    rated_power_w?: number | null;
    std_cost_paise: bigint;
    sale_price_paise: bigint;
    tax_rate_bp: number;
    uom: string;
  };
}

export interface SystemTemplateData {
  id: string;
  code: string;
  name: string;
  capacity_kw: number;
  default_cable_distance_m: number;
  labour_allowance_paise: bigint;
  price_override_paise?: bigint | null;
  bom_lines: TemplateLineData[];
}

export interface CalculatedBomLine {
  productId: string;
  description: string;
  rule: BomRule;
  qty: number;
  unitPricePaise: bigint;
  unitCostPaise: bigint;
  taxRateBp: number;
  lineTotalPaise: bigint;
  lineCostPaise: bigint;
}

export interface BomCalculationResult {
  lines: CalculatedBomLine[];
  panelCount: number;
  installedCapacityKwp: number;
  subtotalPaise: bigint;
  totalCostPaise: bigint;
  defaultCableDistanceUsed: boolean;
}

export function generateBom(
  template: SystemTemplateData,
  input: BomInput
): BomCalculationResult {
  if (!template || !template.bom_lines || template.bom_lines.length === 0) {
    throw new Error('System template contains no BOM lines');
  }

  // Enforce template yields at least one solar panel and one inverter
  const panelLine = template.bom_lines.find((l) => l.product?.category === 'SOLAR_PANEL');
  if (!panelLine) {
    throw new Error('System template must include at least one solar panel product');
  }

  const inverterLine = template.bom_lines.find((l) => l.product?.category === 'INVERTER');
  if (!inverterLine) {
    throw new Error('System template must include at least one inverter product');
  }

  const capacityKw = input.capacityKw;
  if (!capacityKw || capacityKw <= 0) {
    throw new Error('System capacity must be greater than zero');
  }

  // Dynamically resolve rated Wp: input overrides template panel's rated power, which falls back to 540 Wp
  const panelRatedWp = input.panelRatedWp || panelLine.product.rated_power_w || 540;
  const cableDistanceM = input.cableDistanceM ?? Number(template.default_cable_distance_m) ?? 25;
  const defaultCableDistanceUsed = input.cableDistanceM === undefined || input.cableDistanceM === null;

  // Panel count calculation: capacity in W / panel Wp, rounded up
  // e.g. 3000 W / 540 Wp = 5.55 -> 6 panels
  const capacityW = capacityKw * 1000;
  const panelCount = Math.ceil(capacityW / panelRatedWp);
  if (panelCount <= 0) {
    throw new Error('Calculated panel count must be greater than zero');
  }
  const installedCapacityKwp = Number(((panelCount * panelRatedWp) / 1000).toFixed(2));

  let subtotalPaise = 0n;
  let totalCostPaise = 0n;

  const lines: CalculatedBomLine[] = template.bom_lines.map((line) => {
    let qty = 0;
    const rule = line.rule;
    const val = Number(line.value);
    const allowance = Number(line.allowance || 0);

    switch (rule) {
      case 'FIXED':
        qty = val;
        break;
      case 'PANEL_COUNT':
        qty = panelCount;
        break;
      case 'PER_PANEL':
        qty = val * panelCount;
        break;
      case 'PER_KW':
        qty = Math.ceil(val * capacityKw);
        break;
      case 'PER_CABLE_METER':
        // value x cable distance + allowance, rounded up
        // e.g. 2 x 25m + 5m = 55m
        qty = Math.ceil(val * cableDistanceM + allowance);
        break;
      case 'MANUAL':
        qty = val;
        break;
      default:
        qty = val;
    }

    const unitPricePaise = line.product.sale_price_paise;
    const unitCostPaise = line.product.std_cost_paise;
    const lineTotalPaise = BigInt(Math.round(qty * Number(unitPricePaise)));
    const lineCostPaise = BigInt(Math.round(qty * Number(unitCostPaise)));

    subtotalPaise += lineTotalPaise;
    totalCostPaise += lineCostPaise;

    return {
      productId: line.product.id,
      description: line.product.name,
      rule,
      qty,
      unitPricePaise,
      unitCostPaise,
      taxRateBp: line.product.tax_rate_bp,
      lineTotalPaise,
      lineCostPaise,
    };
  });

  return {
    lines,
    panelCount,
    installedCapacityKwp,
    subtotalPaise,
    totalCostPaise,
    defaultCableDistanceUsed,
  };
}
