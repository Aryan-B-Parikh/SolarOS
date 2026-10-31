import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
const prisma = new PrismaClient();
const TOKEN = 'dc4d3e75573660cd5b4886e9dc541d94';
const hashToken = (r) => crypto.createHash('sha256').update(r).digest('hex');

async function main() {
  const link = await prisma.customerAccessLink.findUnique({ where: { token_hash: hashToken(TOKEN) } });
  if (!link) { console.log('No portal link'); return; }
  const cid = link.customer_id;
  const c = await prisma.customer.findUnique({ where: { id: cid } });
  console.log('CUSTOMER:', c?.customer_number, c?.name);

  let lead = await prisma.lead.findFirst({ where: { customer_id: cid }, orderBy: { created_at: 'desc' } });
  if (!lead) {
    lead = await prisma.lead.create({ data: { lead_number: `L-FLOW-${Date.now()}`, customer_id: cid, source: 'PORTAL', status: 'NEW', requested_capacity_kw: 3, system_type_pref: 'ON_GRID', wants_subsidy: true, monthly_bill_paise: 300000n, tariff_paise: 700n } });
  }
  await prisma.lead.update({ where: { id: lead.id }, data: { status: 'SURVEY_APPROVED' } });
  console.log('Lead:', lead.lead_number, '-> SURVEY_APPROVED');

  const surveyExists = await prisma.siteSurvey.findUnique({ where: { lead_id: lead.id } });
  if (!surveyExists) {
    await prisma.siteSurvey.create({ data: { lead_id: lead.id, status: 'APPROVED', scheduled_at: new Date(), completed_at: new Date(), roof_type: 'RCC_FLAT', azimuth_deg: 180, tilt_deg: 15, usable_area_sqm: 80, cable_distance_m: 25, notes: 'Roof suitable.' } });
    console.log('Survey approved');
  } else { console.log('Survey exists'); }

  const assessmentExists = await prisma.siteAssessment.findUnique({ where: { lead_id: lead.id } });
  if (!assessmentExists) {
    await prisma.siteAssessment.create({ data: { lead_id: lead.id, survey_id: (await prisma.siteSurvey.findUnique({ where: { lead_id: lead.id } }))?.id || null, inputs: { requested_kw: 3, system_type: 'ON_GRID', monthly_bill_paise: 300000 }, recommended_kw: 3, recommended_type: 'ON_GRID', annual_generation_kwh: 4928, annual_savings_paise: 3449300n, payback_years: 4.2, flags: ['ELIGIBLE', 'ON_GRID'] } });
    console.log('Assessment created');
  } else { console.log('Assessment exists'); }

  const product = await prisma.product.findFirst();
  const quoteExists = await prisma.quote.findFirst({ where: { lead_id: lead.id, status: { not: 'SUPERSEDED' } }, orderBy: { version: 'desc' } });
  let quote;
  if (!quoteExists) {
    quote = await prisma.quote.create({ data: { quote_number: `Q-FLOW-${Date.now()}`, lead_id: lead.id, customer_id: cid, version: 1, status: 'SENT', capacity_kw: 3, system_type: 'ON_GRID', cable_distance_m: 25, subtotal_paise: 10000000n, discount_paise: 0n, tax_paise: 1800000n, total_paise: 11800000n, subsidy_estimate_paise: 7800000n, valid_until: new Date(Date.now() + 15*86400000), sent_at: new Date(), lines: { create: [{ product_id: product?.id || '00000000-0000-0000-0000-000000000000', description: `${product?.name || 'Solar'} (fixture)`, qty: 1, unit_price_paise: 10000000n, tax_rate_bp: 1800, line_total_paise: 11800000n, rule: 'FIXED', sort_order: 0 }] } }, include: { lines: true } });
    console.log('Quote created:', quote.quote_number);
  } else { quote = quoteExists; console.log('Quote reused:', quote.quote_number); }

  if (quote.status === 'SENT') {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED', accepted_at: new Date(), accepted_name: c?.name || 'Flow' } });
    await prisma.lead.update({ where: { id: lead.id }, data: { status: 'WON' } });
    console.log('Quote accepted');
  } else { console.log('Quote status:', quote.status); }

  const orderExists = await prisma.order.findFirst({ where: { quote_id: quote.id } });
  let order;
  if (!orderExists) {
    order = await prisma.order.create({ data: { order_number: `O-FLOW-${Date.now()}`, quote_id: quote.id, customer_id: cid, status: 'CONFIRMED', capacity_kw: 3, system_type: 'ON_GRID', site_snapshot: { address: c?.address || 'Test', pincode: c?.pincode || '380001', cableDistanceM: 25, roofAreaSqm: 80 }, subtotal_paise: quote.subtotal_paise, discount_paise: quote.discount_paise, tax_paise: quote.tax_paise, total_paise: quote.total_paise, advance_required_paise: BigInt(Math.round(Number(quote.total_paise)*0.3)) } });
    console.log('Order created:', order.order_number);
  } else { order = orderExists; console.log('Order reused:', order.order_number); }

  const payExists = await prisma.payment.findFirst({ where: { order_id: order.id, status: 'VERIFIED' } });
  if (!payExists) {
    await prisma.payment.create({ data: { order: { connect: { id: order.id } }, amount_paise: BigInt(Math.round(Number(quote.total_paise)*0.3)), status: 'VERIFIED', method: 'NEFT', kind: 'ADVANCE', received_on: new Date(), reference: 'FLOW-ADV', idempotency_key: `adv-${order.id}`, recorded_by: "00000000-0000-0000-0000-000000000001" } });
    console.log('Payment verified');
  } else { console.log('Payment already verified'); }

  const instExists = await prisma.installation.findFirst({ where: { order_id: order.id } });
  let installation;
  if (!instExists) {
    installation = await prisma.installation.create({ data: { order_id: order.id, status: 'COMPLETED', scheduled_on: new Date(), slot: 'MORNING', started_at: new Date(), finished_at: new Date(), test_reading_w: 2850, installed_capacity_kw: 3, signoff_hash: `sha256_new_${Date.now()}`, signed_at: new Date(), checklist: { mounting_stands_rigid: true, modules_clamped_aligned: true, dc_ac_cables_conduit: true, earthing_resistance_tested: true, inverter_synchronized: true } } });
    console.log('Installation created:', installation.id);
  } else { installation = instExists; console.log('Installation exists:', installation.id); }

  const certLinkExists = await prisma.customerAccessLink.findFirst({ where: { customer_id: cid, scope: 'CERTIFICATE' } });
  if (!certLinkExists) {
    const raw = crypto.randomBytes(16).toString('hex');
    await prisma.installation.update({ where: { id: installation.id }, data: { certificate_token_hash: hashToken(raw) } });
    await prisma.customerAccessLink.create({ data: { customer_id: cid, scope: 'CERTIFICATE', token_hash: hashToken(raw), expires_at: new Date(Date.now() + 90*86400000) } });
    console.log('Certificate link created');
  } else { console.log('Certificate link exists'); }

  const warrantyCount = await prisma.warranty.count({ where: { installation_id: installation.id } });
  if (warrantyCount === 0) {
    const prod = product || await prisma.product.findFirst();
    for (let i = 0; i < 2; i++) {
      const w = await prisma.warranty.create({ data: { installation_id: installation.id, customer_id: cid, product_id: prod?.id || '00000000-0000-0000-0000-000000000000', coverage: 'EQUIPMENT', status: 'ACTIVE', source: 'SIGN_OFF', months: i === 0 ? 300 : 60, start_date: new Date(), end_date: new Date(Date.now() + (i === 0 ? 300 : 60)*30*86400000) } });
      const qr = `QR-${w.id.slice(0,8).toUpperCase()}`;
      await prisma.inventoryUnit.create({ data: { installation_id: installation.id, product_id: prod?.id || '00000000-0000-0000-0000-000000000000', serial_number: `SER-${w.id.slice(0,6).toUpperCase()}`, qr_code: qr } });
      await prisma.warranty.update({ where: { id: w.id }, data: { unit_id: (await prisma.inventoryUnit.findFirst({ where: { installation_id: installation.id }, orderBy: { created_at: 'desc' } }))?.id } });
      console.log('Warranty', w.id, 'QR', qr);
    }
  } else { console.log('Warranties exist:', warrantyCount); }

  const serviceExists = await prisma.serviceTicket.findFirst({ where: { customer_id: cid } });
  if (!serviceExists) {
    await prisma.serviceTicket.create({ data: { customer_id: cid, title: 'Initial Inspection', description: 'Done.', status: 'CLOSED', priority: 'LOW' } });
    console.log('Service ticket created');
  } else { console.log('Service ticket exists'); }

  console.log('FLOW COMPLETE');
}
main().catch(e => console.error('Error:', e)).finally(async () => { await prisma.$disconnect(); });
