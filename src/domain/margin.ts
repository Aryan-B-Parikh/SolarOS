/**
 * SunPower Ops - Margin Engine (FR-3.8, Section 2.4)
 * Estimated margin = net price - BOM standard cost - template labour allowance
 * Margin bp = (estimated margin / net price) * 10,000
 * If margin bp < target margin bp (default 2000 bp = 20%), flag margin_warning = true
 */

export interface MarginInput {
  netPricePaise: bigint;
  totalBomCostPaise: bigint;
  labourAllowancePaise?: bigint;
  targetMarginBp?: number; // e.g. 2000 = 20.00%
}

export interface MarginResult {
  estimatedMarginPaise: bigint;
  estimatedMarginBp: number;
  marginPercent: number;
  marginWarning: boolean;
}

export function calculateMargin(input: MarginInput): MarginResult {
  const labour = input.labourAllowancePaise || 0n;
  const targetBp = input.targetMarginBp ?? 2000; // 20% default

  const estimatedMarginPaise = input.netPricePaise - input.totalBomCostPaise - labour;

  let estimatedMarginBp = 0;
  if (input.netPricePaise > 0n) {
    const marginRatio = Number(estimatedMarginPaise) / Number(input.netPricePaise);
    estimatedMarginBp = Math.round(marginRatio * 10000);
  }

  const marginPercent = Number((estimatedMarginBp / 100).toFixed(2));
  const marginWarning = estimatedMarginBp < targetBp;

  return {
    estimatedMarginPaise,
    estimatedMarginBp,
    marginPercent,
    marginWarning,
  };
}
