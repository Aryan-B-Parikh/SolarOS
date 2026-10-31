import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { confirmOrder } from '@/services/orders';

describe('Concurrency & Deadlock Prevention (Integration / ADR D3)', () => {
  let panelProductId: string;
  let testWarehouseId: string;
  let testOrderId1: string;
  let testOrderId2: string;
  let customerId: string;

  before(async () => {
    const product = await prisma.product.findUnique({
      where: { sku: 'PANEL-540W' },
    });
    assert.ok(product, 'PANEL-540W must exist');
    panelProductId = product.id;

    const location = await prisma.stockLocation.findUnique({
      where: { code: 'WH-MAIN' },
    });
    assert.ok(location, 'WH-MAIN location must exist');
    testWarehouseId = location.id;

    // Create a temporary customer
    const customer = await prisma.customer.create({
      data: {
        customer_number: `CUST-CONC-${Date.now()}`,
        name: 'Concurrent Test Customer',
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        address: 'Test Address',
        pincode: '380001',
      },
    });
    customerId = customer.id;

    const lead1 = await prisma.lead.create({
      data: {
        lead_number: `LD-CONC-1-${Date.now()}`,
        customer_id: customer.id,
        status: 'WON',
        source: 'WEB',
      },
    });

    const lead2 = await prisma.lead.create({
      data: {
        lead_number: `LD-CONC-2-${Date.now()}`,
        customer_id: customer.id,
        status: 'WON',
        source: 'WEB',
      },
    });

    const q1 = await prisma.quote.create({
      data: {
        quote_number: `QT-CONC-1-${Date.now()}`,
        lead_id: lead1.id,
        customer_id: customer.id,
        capacity_kw: 3.0,
        subtotal_paise: 18000000n,
        tax_paise: 2000000n,
        total_paise: 20000000n,
        valid_until: new Date(Date.now() + 15 * 86400000),
        status: 'ACCEPTED',
      },
    });

    const q2 = await prisma.quote.create({
      data: {
        quote_number: `QT-CONC-2-${Date.now()}`,
        lead_id: lead2.id,
        customer_id: customer.id,
        capacity_kw: 3.0,
        subtotal_paise: 18000000n,
        tax_paise: 2000000n,
        total_paise: 20000000n,
        valid_until: new Date(Date.now() + 15 * 86400000),
        status: 'ACCEPTED',
      },
    });

    // Create two test orders with lines
    const o1 = await prisma.order.create({
      data: {
        order_number: `SO-CONC-1-${Date.now()}`,
        quote_id: q1.id,
        customer_id: customer.id,
        status: 'PENDING_ADVANCE',
        capacity_kw: 3.0,
        subtotal_paise: 18000000n,
        tax_paise: 2000000n,
        total_paise: 20000000n,
        advance_required_paise: 6000000n,
        site_snapshot: {},
        lines: {
          create: [
            {
              product_id: panelProductId,
              description: 'Solar Panels',
              qty: 6,
              unit_price_paise: 1450000n,
              tax_rate_bp: 1200,
            },
          ],
        },
      },
      include: { lines: true },
    });
    testOrderId1 = o1.id;

    const o2 = await prisma.order.create({
      data: {
        order_number: `SO-CONC-2-${Date.now()}`,
        quote_id: q2.id,
        customer_id: customer.id,
        status: 'PENDING_ADVANCE',
        capacity_kw: 3.0,
        subtotal_paise: 18000000n,
        tax_paise: 2000000n,
        total_paise: 20000000n,
        advance_required_paise: 6000000n,
        site_snapshot: {},
        lines: {
          create: [
            {
              product_id: panelProductId,
              description: 'Solar Panels',
              qty: 6,
              unit_price_paise: 1450000n,
              tax_rate_bp: 1200,
            },
          ],
        },
      },
      include: { lines: true },
    });
    testOrderId2 = o2.id;
  });

  after(async () => {
    // Restore reserved balance on panel stock level
    await prisma.stockLevel.update({
      where: {
        product_id_location_id: {
          product_id: panelProductId,
          location_id: testWarehouseId,
        },
      },
      data: {
        reserved: { decrement: 12 },
      },
    });

    await prisma.installation.deleteMany({
      where: { order_id: { in: [testOrderId1, testOrderId2] } },
    });
    await prisma.invoiceLine.deleteMany({
      where: { invoice: { order_id: { in: [testOrderId1, testOrderId2] } } },
    });
    await prisma.invoice.deleteMany({
      where: { order_id: { in: [testOrderId1, testOrderId2] } },
    });
    await prisma.dispatchLine.deleteMany({
      where: { dispatch: { order_id: { in: [testOrderId1, testOrderId2] } } },
    });
    await prisma.dispatch.deleteMany({
      where: { order_id: { in: [testOrderId1, testOrderId2] } },
    });
    await prisma.stockAllocation.deleteMany({
      where: { order_line: { order_id: { in: [testOrderId1, testOrderId2] } } },
    });
    await prisma.orderLine.deleteMany({
      where: { order_id: { in: [testOrderId1, testOrderId2] } },
    });
    await prisma.order.deleteMany({
      where: { id: { in: [testOrderId1, testOrderId2] } },
    });
    await prisma.quote.deleteMany({
      where: { customer_id: customerId },
    });
    await prisma.lead.deleteMany({
      where: { customer_id: customerId },
    });
    await prisma.customer.deleteMany({
      where: { id: customerId },
    });
    await prisma.$disconnect();
  });

  it('runs concurrent order confirmations without deadlock and ensures consistent reserved balances', async () => {
    // Record baseline reserved quantity
    const baseline = await prisma.stockLevel.findUnique({
      where: {
        product_id_location_id: {
          product_id: panelProductId,
          location_id: testWarehouseId,
        },
      },
    });
    assert.ok(baseline, 'Baseline stock level must exist');
    const startReserved = Number(baseline.reserved);

    // Fire 2 concurrent confirmations
    const [res1, res2] = await Promise.all([
      confirmOrder(testOrderId1),
      confirmOrder(testOrderId2),
    ]);

    assert.equal(res1.status, 'CONFIRMED');
    assert.equal(res2.status, 'CONFIRMED');

    // Verify final reserved quantity increased exactly by 6 + 6 = 12
    const finalLevel = await prisma.stockLevel.findUnique({
      where: {
        product_id_location_id: {
          product_id: panelProductId,
          location_id: testWarehouseId,
        },
      },
    });
    assert.ok(finalLevel, 'Final stock level must exist');
    assert.equal(Number(finalLevel.reserved), startReserved + 12);
  });
});
