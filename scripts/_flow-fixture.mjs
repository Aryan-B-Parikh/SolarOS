import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import fs from 'node:fs';

const prisma = new PrismaClient();
const mode = process.argv[2] || 'create';
const stateFile = new URL('./_flow-fixture.json', import.meta.url);
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

if (mode === 'create') {
  const product = await prisma.product.findFirst({ select: { id: true, name: true } });
  if (!product) throw new Error('No product row available for quote line');

  const stamp = Date.now();
  const rawToken = crypto.randomBytes(16).toString('hex');

  const customer = await prisma.customer.create({
    data: {
      customer_number: `C-TEST-${stamp}`,
      name: 'Flow Test Customer',
      phone: '+919999000001',
      email: `flowtest-${stamp}@example.com`,
      address: 'Test Site, Solar Road',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001',
      type: 'RESIDENTIAL',
      consent_at: new Date(),
    },
  });

  const lead = await prisma.lead.create({
    data: {
      lead_number: `L-TEST-${stamp}`,
      customer_id: customer.id,
      source: 'WEB',
      status: 'SURVEY_APPROVED',
      requested_capacity_kw: 3,
      system_type_pref: 'ON_GRID',
      wants_subsidy: true,
      monthly_bill_paise: 300000n,
      tariff_paise: 700n,
    },
  });

  const quote = await prisma.quote.create({
    data: {
      quote_number: `Q-TEST-${stamp}`,
      lead_id: lead.id,
      customer_id: customer.id,
      version: 1,
      status: 'SENT',
      capacity_kw: 3,
      system_type: 'ON_GRID',
      cable_distance_m: 20,
      subtotal_paise: 10000000n,
      discount_paise: 0n,
      tax_paise: 1800000n,
      total_paise: 11800000n,
      subsidy_estimate_paise: 7800000n,
      valid_until: new Date(Date.now() + 15 * 24 * 3600 * 1000),
      sent_at: new Date(),
      lines: {
        create: [
          {
            product_id: product.id,
            description: `${product.name} (flow-test line)`,
            qty: 1,
            unit_price_paise: 10000000n,
            tax_rate_bp: 1800,
            line_total_paise: 11800000n,
            rule: 'FIXED',
            sort_order: 0,
          },
        ],
      },
    },
  });

  const link = await prisma.customerAccessLink.create({
    data: {
      customer_id: customer.id,
      scope: 'PORTAL',
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    },
  });

  fs.writeFileSync(
    stateFile,
    JSON.stringify({ customerId: customer.id, leadId: lead.id, quoteId: quote.id, linkId: link.id, rawToken }, null, 2)
  );

  console.log(JSON.stringify({ rawToken, quoteNumber: quote.quote_number, customerId: customer.id }));
} else if (mode === 'cleanup') {
  const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const orders = await prisma.order.findMany({ where: { quote_id: s.quoteId }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    for (const o of orders) {
      await tx.orderLine.deleteMany({ where: { order_id: o.id } });
    }
    await tx.order.deleteMany({ where: { quote_id: s.quoteId } });
    await tx.auditLog.deleteMany({ where: { entity_id: s.quoteId } });
    await tx.quoteLine.deleteMany({ where: { quote_id: s.quoteId } });
    await tx.quote.delete({ where: { id: s.quoteId } });
    await tx.customerAccessLink.deleteMany({ where: { customer_id: s.customerId } });
    await tx.leadActivity.deleteMany({ where: { lead_id: s.leadId } });
    await tx.lead.delete({ where: { id: s.leadId } });
    await tx.customer.delete({ where: { id: s.customerId } });
  });

  fs.unlinkSync(stateFile);
  console.log('cleaned up flow fixture');
}

await prisma.$disconnect();
