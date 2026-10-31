import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { confirmOrder, cancelOrder } from '@/services/orders';

describe('Order Confirmation & Cancellation Round-Trip (Integration)', () => {
  let panelProductId: string;
  let testWarehouseId: string;
  let testOrderId: string;
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

    const customer = await prisma.customer.create({
      data: {
        customer_number: `CUST-RT-${Date.now()}`,
        name: 'RoundTrip Test Customer',
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        address: 'Test Address',
        pincode: '380001',
      },
    });
    customerId = customer.id;

    const lead = await prisma.lead.create({
      data: {
        lead_number: `LD-RT-${Date.now()}`,
        customer_id: customer.id,
        status: 'WON',
        source: 'WEB',
      },
    });

    const quote = await prisma.quote.create({
      data: {
        quote_number: `QT-RT-${Date.now()}`,
        lead_id: lead.id,
        customer_id: customer.id,
        capacity_kw: 3.0,
        subtotal_paise: 18000000n,
        tax_paise: 2000000n,
        total_paise: 20000000n,
        valid_until: new Date(Date.now() + 15 * 86400000),
        status: 'ACCEPTED',
      },
    });

    const order = await prisma.order.create({
      data: {
        order_number: `SO-RT-${Date.now()}`,
        quote_id: quote.id,
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
    testOrderId = order.id;
  });

  after(async () => {
    await prisma.installation.deleteMany({ where: { order_id: testOrderId } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { order_id: testOrderId } } });
    await prisma.invoice.deleteMany({ where: { order_id: testOrderId } });
    await prisma.dispatchLine.deleteMany({ where: { dispatch: { order_id: testOrderId } } });
    await prisma.dispatch.deleteMany({ where: { order_id: testOrderId } });
    await prisma.stockAllocation.deleteMany({ where: { order_line: { order_id: testOrderId } } });
    await prisma.orderLine.deleteMany({ where: { order_id: testOrderId } });
    await prisma.order.deleteMany({ where: { id: testOrderId } });
    await prisma.quote.deleteMany({ where: { customer_id: customerId } });
    await prisma.lead.deleteMany({ where: { customer_id: customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('completes full confirm and cancel cycle: reserves stock then restores reserved balances', async () => {
    // 1. Baseline
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

    // 2. Confirm order
    const confirmed = await confirmOrder(testOrderId);
    assert.equal(confirmed.status, 'CONFIRMED');

    // Verify stock reserved
    const postConfirm = await prisma.stockLevel.findUnique({
      where: {
        product_id_location_id: {
          product_id: panelProductId,
          location_id: testWarehouseId,
        },
      },
    });
    assert.ok(postConfirm);
    assert.equal(Number(postConfirm.reserved), startReserved + 6);

    // 3. Cancel order
    const cancelled = await cancelOrder(testOrderId, 'Customer requested project cancellation');
    assert.equal(cancelled.status, 'CANCELLED');

    // Verify stock restored
    const postCancel = await prisma.stockLevel.findUnique({
      where: {
        product_id_location_id: {
          product_id: panelProductId,
          location_id: testWarehouseId,
        },
      },
    });
    assert.ok(postCancel);
    assert.equal(Number(postCancel.reserved), startReserved);

    // Verify allocation marked RELEASED
    const alloc = await prisma.stockAllocation.findFirst({
      where: { order_line: { order_id: testOrderId } },
    });
    assert.ok(alloc);
    assert.equal(alloc.status, 'RELEASED');
  });
});

