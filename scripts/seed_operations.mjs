import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding sample operations data...');

  const user = await prisma.user.findFirst();
  const order = await prisma.order.findFirst({ include: { customer: true, lines: true } });
  const location = await prisma.stockLocation.findFirst();
  const products = await prisma.product.findMany({ take: 3 });
  const warranty = await prisma.warranty.findFirst();
  const installation = await prisma.installation.findFirst();

  if (!user || !order || !location || products.length === 0) {
    console.error('Missing core prerequisites in DB!');
    return;
  }

  // Ensure order has lines
  if (order.lines.length === 0) {
    const line1 = await prisma.orderLine.create({
      data: {
        order_id: order.id,
        product_id: products[0].id,
        description: products[0].name,
        qty: 8,
        unit_price_paise: products[0].base_price_paise || BigInt(1500000),
        tax_rate_bp: 1800,
        qty_reserved: 8,
      },
    });
    const line2 = await prisma.orderLine.create({
      data: {
        order_id: order.id,
        product_id: products[1].id,
        description: products[1].name,
        qty: 1,
        unit_price_paise: products[1].base_price_paise || BigInt(4500000),
        tax_rate_bp: 1800,
        qty_reserved: 1,
      },
    });
    order.lines = [line1, line2];
    console.log('Added 2 order lines to order:', order.order_number);
  }

  // 1. Supplier
  let supplier = await prisma.supplier.findFirst();
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        name: 'SunGrow Solar Solutions Pvt Ltd',
        contact: 'Rajesh Sharma',
        phone: '+919876500001',
        email: 'sales@sungrow.in',
        gstin: '24AAACS1234A1Z5',
      },
    });
    console.log('Created supplier:', supplier.id);
  }

  // 2. Purchase Order
  let po = await prisma.purchaseOrder.findFirst();
  if (!po) {
    po = await prisma.purchaseOrder.create({
      data: {
        po_number: 'PO-2026-0001',
        supplier_id: supplier.id,
        status: 'OPEN',
        ordered_on: new Date(),
        expected_on: new Date(Date.now() + 7 * 86400000),
        total_paise: BigInt(5000000),
        created_by: user.id,
        lines: {
          create: [
            {
              product_id: products[0].id,
              qty_ordered: 10,
              qty_received: 0,
              unit_cost_paise: BigInt(500000),
            },
          ],
        },
      },
    });
    console.log('Created PO:', po.id);
  }

  // 3. Dispatch
  let dispatch = await prisma.dispatch.findFirst();
  if (!dispatch) {
    dispatch = await prisma.dispatch.create({
      data: {
        dispatch_number: 'DSP-2026-0001',
        order_id: order.id,
        status: 'PICKING',
        from_location_id: location.id,
        scheduled_on: new Date(),
        packed_by: user.id,
        lines: {
          create: [
            {
              order_line_id: order.lines[0].id,
              product_id: products[0].id,
              qty_required: 8,
              qty_loaded: 0,
            },
          ],
        },
      },
    });
    console.log('Created Dispatch:', dispatch.id);
  }

  // 4. Service Ticket
  let ticket = await prisma.serviceTicket.findFirst();
  if (!ticket) {
    ticket = await prisma.serviceTicket.create({
      data: {
        ticket_number: 'TCK-2026-0001',
        customer_id: order.customer_id,
        installation_id: installation?.id,
        warranty_id: warranty?.id,
        channel: 'WEB',
        category: 'LOW_GENERATION',
        fault_code: 'F01',
        description: 'Solar generation drop of ~20% noticed during peak noon hours.',
        priority: 'NORMAL',
        status: 'OPEN',
        warranty_verdict: 'IN_WARRANTY',
        billing_mode: 'WARRANTY',
        assigned_to: user.id,
        sla_due_at: new Date(Date.now() + 48 * 3600000),
        created_by: user.id,
      },
    });
    console.log('Created Service Ticket:', ticket.id);
  }

  console.log('Operations data seed completed successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
