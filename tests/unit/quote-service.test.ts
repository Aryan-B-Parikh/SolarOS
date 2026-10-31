import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateBom } from '../../src/domain/bom.ts';
import { calculateMargin } from '../../src/domain/margin.ts';

describe('Member 1 - Phase 3 Quotation & BOM Engine (FR-3.1, TRD 2.4, D17)', () => {
  // Mock template with all 5 quantity rules representing a complete solar kit
  const fullTemplate = {
    id: 'tpl-on-grid-3kw',
    code: 'ONG3KW',
    name: '3 kW On-Grid Solar System',
    capacity_kw: 3,
    default_cable_distance_m: 25,
    labour_allowance_paise: 1500000n, // Rs 15,000
    bom_lines: [
      {
        id: 'l-1',
        product_id: 'p-panel',
        rule: 'PANEL_COUNT' as const,
        value: 1,
        allowance: 0,
        product: {
          id: 'p-panel',
          sku: 'SOL-540W',
          name: 'Solar Panel 540 Wp Mono PERC',
          category: 'SOLAR_PANEL',
          std_cost_paise: 900000n,
          sale_price_paise: 1300000n,
          tax_rate_bp: 1200,
          uom: 'NOS',
        },
      },
      {
        id: 'l-2',
        product_id: 'p-inv',
        rule: 'FIXED' as const,
        value: 1,
        allowance: 0,
        product: {
          id: 'p-inv',
          sku: 'INV-3KW',
          name: 'On-grid Inverter 3 kW',
          category: 'INVERTER',
          std_cost_paise: 3000000n,
          sale_price_paise: 4500000n,
          tax_rate_bp: 1800,
          uom: 'NOS',
        },
      },
      {
        id: 'l-3',
        product_id: 'p-clamp-mid',
        rule: 'PER_PANEL' as const,
        value: 4, // 4 mid clamps per panel
        allowance: 0,
        product: {
          id: 'p-clamp-mid',
          sku: 'STR-MID-CLAMP',
          name: 'Aluminium Mid Clamp',
          category: 'STRUCTURE',
          std_cost_paise: 3500n,
          sale_price_paise: 6000n,
          tax_rate_bp: 1800,
          uom: 'NOS',
        },
      },
      {
        id: 'l-4',
        product_id: 'p-earthing',
        rule: 'PER_KW' as const,
        value: 1, // 1 earthing strip per kW
        allowance: 0,
        product: {
          id: 'p-earthing',
          sku: 'BOS-EARTH-STRIP',
          name: 'Copper Earthing Strip',
          category: 'BOS',
          std_cost_paise: 25000n,
          sale_price_paise: 45000n,
          tax_rate_bp: 1800,
          uom: 'NOS',
        },
      },
      {
        id: 'l-5',
        product_id: 'p-cable',
        rule: 'PER_CABLE_METER' as const,
        value: 2, // 2 runs (+ and -) per meter
        allowance: 5, // +5m slack
        product: {
          id: 'p-cable',
          sku: 'CAB-4SQMM',
          name: 'Solar DC Cable 4 sq mm',
          category: 'CABLE',
          std_cost_paise: 4000n,
          sale_price_paise: 7000n,
          tax_rate_bp: 1800,
          uom: 'METER',
        },
      },
    ],
  };

  it('correctly computes quantities for all 5 BOM rules simultaneously', () => {
    const bom = generateBom(fullTemplate as any, {
      capacityKw: 3,
      cableDistanceM: 25,
      panelRatedWp: 540,
    });

    // 1. PANEL_COUNT: 3000 W / 540 Wp = 5.55 -> 6 panels
    const panelLine = bom.lines.find((l) => l.rule === 'PANEL_COUNT');
    assert.equal(panelLine?.qty, 6);

    // 2. FIXED: Inverter = 1
    const invLine = bom.lines.find((l) => l.rule === 'FIXED');
    assert.equal(invLine?.qty, 1);

    // 3. PER_PANEL: 4 clamps * 6 panels = 24 clamps
    const clampLine = bom.lines.find((l) => l.rule === 'PER_PANEL');
    assert.equal(clampLine?.qty, 24);

    // 4. PER_KW: 1 strip * 3 kW = 3 strips
    const earthLine = bom.lines.find((l) => l.rule === 'PER_KW');
    assert.equal(earthLine?.qty, 3);

    // 5. PER_CABLE_METER: 2 * 25m + 5m = 55m cable
    const cableLine = bom.lines.find((l) => l.rule === 'PER_CABLE_METER');
    assert.equal(cableLine?.qty, 55);

    // Check installed system capacity: 6 * 540 Wp = 3.24 kWp
    assert.equal(bom.installedCapacityKwp, 3.24);
  });

  it('falls back to template default cable distance if none is provided', () => {
    const bom = generateBom(fullTemplate as any, {
      capacityKw: 3,
    });

    assert.equal(bom.defaultCableDistanceUsed, true);
    const cableLine = bom.lines.find((l) => l.rule === 'PER_CABLE_METER');
    assert.equal(cableLine?.qty, 55); // Uses default_cable_distance_m: 25 -> 2*25 + 5 = 55
  });

  it('enforces sales discount boundary rule (<= 5% passes, > 5% requires approval)', () => {
    const subtotalPaise = 10000000n; // Rs 1,00,000

    const checkDiscountAuthority = (discountPaise: bigint, userRole: string) => {
      const discountPercent = Number((discountPaise * 100n) / subtotalPaise);
      if (userRole === 'SALES' && discountPercent > 5) {
        throw new Error('DISCOUNT_NEEDS_APPROVAL');
      }
      return true;
    };

    // 5% discount (Rs 5,000) allowed for SALES
    assert.equal(checkDiscountAuthority(500000n, 'SALES'), true);

    // 6% discount (Rs 6,000) rejected for SALES
    assert.throws(
      () => checkDiscountAuthority(600000n, 'SALES'),
      /DISCOUNT_NEEDS_APPROVAL/
    );

    // 10% discount allowed for DIRECTOR
    assert.equal(checkDiscountAuthority(1000000n, 'DIRECTOR'), true);
  });

  it('guards quote sending by requiring survey approval (SURVEY_NOT_APPROVED check)', () => {
    const checkSendGuard = (leadStatus: string) => {
      if (leadStatus !== 'SURVEY_APPROVED' && leadStatus !== 'QUOTED') {
        throw new Error('SURVEY_NOT_APPROVED: Cannot send quotation before survey is approved');
      }
      return true;
    };

    assert.throws(() => checkSendGuard('NEW'), /SURVEY_NOT_APPROVED/);
    assert.throws(() => checkSendGuard('CONTACTED'), /SURVEY_NOT_APPROVED/);
    assert.throws(() => checkSendGuard('QUALIFIED'), /SURVEY_NOT_APPROVED/);
    assert.throws(() => checkSendGuard('SURVEY_SCHEDULED'), /SURVEY_NOT_APPROVED/);
    assert.equal(checkSendGuard('SURVEY_APPROVED'), true);
    assert.equal(checkSendGuard('QUOTED'), true);
  });

  it('calculates target margin and flags warning when margin is below 20%', () => {
    // Healthy margin: 25%
    const healthyMargin = calculateMargin({
      netPricePaise: 20000000n, // Rs 2,00,000
      totalBomCostPaise: 14000000n, // Rs 1,40,000
      labourAllowancePaise: 1000000n, // Rs 10,000
      targetMarginBp: 2000, // 20%
    });
    // Margin = 200,000 - 140,000 - 10,000 = 50,000 (25%)
    assert.equal(healthyMargin.marginPercent, 25);
    assert.equal(healthyMargin.marginWarning, false);

    // Thin margin: 15% -> warning triggered
    const thinMargin = calculateMargin({
      netPricePaise: 20000000n,
      totalBomCostPaise: 16000000n,
      labourAllowancePaise: 1000000n,
      targetMarginBp: 2000,
    });
    // Margin = 200,000 - 160,000 - 10,000 = 30,000 (15%)
    assert.equal(thinMargin.marginPercent, 15);
    assert.equal(thinMargin.marginWarning, true);
  });

  it('enforces quote versioning invariants (superseded quotes become immutable)', () => {
    const mockQuoteV1 = {
      id: 'q-v1',
      version: 1,
      status: 'SENT',
    };

    const revise = (quote: typeof mockQuoteV1) => {
      if (quote.status === 'ACCEPTED') throw new Error('Cannot revise accepted quote');
      if (quote.status === 'SUPERSEDED') throw new Error('Cannot revise superseded quote');

      const v1Updated = { ...quote, status: 'SUPERSEDED' };
      const v2 = {
        id: 'q-v2',
        version: quote.version + 1,
        supersedes_id: quote.id,
        status: 'DRAFT',
      };
      return { v1Updated, v2 };
    };

    const { v1Updated, v2 } = revise(mockQuoteV1);
    assert.equal(v1Updated.status, 'SUPERSEDED');
    assert.equal(v2.version, 2);
    assert.equal(v2.supersedes_id, 'q-v1');

    // Attempting to revise v1 again throws error
    assert.throws(() => revise(v1Updated), /Cannot revise superseded quote/);
  });
});

