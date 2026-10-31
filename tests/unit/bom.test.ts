import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateBom } from '../../src/domain/bom.ts';
import { calculateMargin } from '../../src/domain/margin.ts';

describe('BOM & Margin Engine (TRD 2.4 / FR-3.1 / FR-3.8)', () => {
  const dummyTemplate = {
    id: 'tpl-1',
    code: 'ONG3KW',
    name: '3 kW On-Grid System',
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
          name: 'Solar panel 540 Wp Mono PERC',
          category: 'SOLAR_PANEL',
          std_cost_paise: 900000n, // Rs 9,000
          sale_price_paise: 1300000n, // Rs 13,000
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
          name: 'On-grid inverter 3 kW',
          category: 'INVERTER',
          std_cost_paise: 3000000n, // Rs 30,000
          sale_price_paise: 4500000n, // Rs 45,000
          tax_rate_bp: 1800,
          uom: 'NOS',
        },
      },
      {
        id: 'l-3',
        product_id: 'p-cable',
        rule: 'PER_CABLE_METER' as const,
        value: 2, // 2 per meter
        allowance: 5, // +5m allowance
        product: {
          id: 'p-cable',
          sku: 'CAB-4SQMM',
          name: 'DC Solar Cable 4 sq mm',
          category: 'CABLE',
          std_cost_paise: 4000n, // Rs 40/m
          sale_price_paise: 7000n, // Rs 70/m
          tax_rate_bp: 1800,
          uom: 'METER',
        },
      },
    ],
  };

  it('calculates 6 panels for 3 kW package with 540 Wp panels', () => {
    const res = generateBom(dummyTemplate as any, { capacityKw: 3, panelRatedWp: 540 });
    assert.equal(res.panelCount, 6);
    assert.equal(res.installedCapacityKwp, 3.24);
  });

  it('calculates cable meters as (2 x 25m + 5m = 55m)', () => {
    const res = generateBom(dummyTemplate as any, { capacityKw: 3, cableDistanceM: 25 });
    const cableLine = res.lines.find((l) => l.rule === 'PER_CABLE_METER');
    assert.equal(cableLine?.qty, 55);
  });

  it('flags margin warning when estimated margin is below 20% target', () => {
    const margin = calculateMargin({
      netPricePaise: 10000000n, // Rs 1,00,000
      totalBomCostPaise: 8200000n, // Rs 82,000
      labourAllowancePaise: 500000n, // Rs 5,000
      targetMarginBp: 2000, // 20%
    });
    // Margin = 1,00,000 - 82,000 - 5,000 = 13,000 (13%)
    assert.equal(margin.marginPercent, 13);
    assert.equal(margin.marginWarning, true);
  });
});
