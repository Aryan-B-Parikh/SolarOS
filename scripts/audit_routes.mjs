import { prisma } from '../src/lib/db.ts';

async function auditRealImplementation() {
  console.log('=== SOLAROS DEEP IMPLEMENTATION AUDIT ===\n');
  const results = {
    passed: [],
    failed: [],
    partial: []
  };

  // 1. Database & Seed Inspection
  try {
    const userCount = await prisma.user.count();
    const productCount = await prisma.product.count();
    const templateCount = await prisma.systemTemplate.count();
    const customerCount = await prisma.customer.count();
    const leadCount = await prisma.lead.count();
    const quoteCount = await prisma.quote.count();
    const orderCount = await prisma.order.count();
    const warrantyCount = await prisma.warranty.count();
    const locationCount = await prisma.stockLocation.count();
    const settingCount = await prisma.setting.count();

    console.log('--- Database Seed Snapshot ---');
    console.log({
      userCount, productCount, templateCount, customerCount,
      leadCount, quoteCount, orderCount, warrantyCount, locationCount, settingCount
    });
  } catch (err) {
    console.error('DB inspection failed:', err.message);
  }

  // 2. Route Probes (HTTP Status on Live Dev Server)
  const staffPages = [
    '/dashboard',
    '/leads',
    '/quotes',
    '/quotes/new',
    '/orders',
    '/schedule',
    '/inventory',
    '/purchasing',
    '/purchasing/suppliers',
    '/dispatch',
    '/service',
    '/analytics',
    '/settings',
    '/accounts'
  ];

  console.log('\n--- Checking Staff Routes ---');
  for (const page of staffPages) {
    try {
      const res = await fetch(`http://localhost:3000${page}`);
      if (res.status === 200) {
        console.log(`[PASS] ${page} -> 200 OK`);
        results.passed.push(page);
      } else {
        console.log(`[FAIL] ${page} -> Status ${res.status}`);
        results.failed.push({ page, status: res.status });
      }
    } catch (e) {
      console.log(`[ERROR] ${page} -> ${e.message}`);
      results.failed.push({ page, error: e.message });
    }
  }

  // 3. Field / Tech Routes
  const fieldPages = [
    '/tech/today',
    '/tech/scan'
  ];
  console.log('\n--- Checking Field Routes ---');
  for (const page of fieldPages) {
    try {
      const res = await fetch(`http://localhost:3000${page}`);
      if (res.status === 200) {
        console.log(`[PASS] ${page} -> 200 OK`);
        results.passed.push(page);
      } else {
        console.log(`[FAIL] ${page} -> Status ${res.status}`);
        results.failed.push({ page, status: res.status });
      }
    } catch (e) {
      console.log(`[ERROR] ${page} -> ${e.message}`);
      results.failed.push({ page, error: e.message });
    }
  }

  // 4. Public Pages
  const publicPages = [
    '/',
    '/enquiry',
    '/portal'
  ];
  console.log('\n--- Checking Public Routes ---');
  for (const page of publicPages) {
    try {
      const res = await fetch(`http://localhost:3000${page}`);
      if (res.status === 200) {
        console.log(`[PASS] ${page} -> 200 OK`);
        results.passed.push(page);
      } else {
        console.log(`[FAIL] ${page} -> Status ${res.status}`);
        results.failed.push({ page, status: res.status });
      }
    } catch (e) {
      console.log(`[ERROR] ${page} -> ${e.message}`);
      results.failed.push({ page, error: e.message });
    }
  }

  // 5. Check Dynamic Detail Pages with Real Seed Data
  console.log('\n--- Checking Dynamic Seeded Detail Pages ---');
  try {
    const lead = await prisma.lead.findFirst();
    if (lead) {
      const res = await fetch(`http://localhost:3000/leads/${lead.id}`);
      console.log(`[LEAD DETAIL] /leads/${lead.id} -> Status ${res.status}`);
      if (res.status === 200) results.passed.push('/leads/[id]'); else results.failed.push({ page: `/leads/${lead.id}`, status: res.status });
    }

    const quote = await prisma.quote.findFirst();
    if (quote) {
      const res = await fetch(`http://localhost:3000/quotes/${quote.id}`);
      console.log(`[QUOTE DETAIL] /quotes/${quote.id} -> Status ${res.status}`);
      if (res.status === 200) results.passed.push('/quotes/[id]'); else results.failed.push({ page: `/quotes/${quote.id}`, status: res.status });
    }

    const order = await prisma.order.findFirst();
    if (order) {
      const res = await fetch(`http://localhost:3000/orders/${order.id}`);
      console.log(`[ORDER DETAIL] /orders/${order.id} -> Status ${res.status}`);
      if (res.status === 200) results.passed.push('/orders/[id]'); else results.failed.push({ page: `/orders/${order.id}`, status: res.status });
    }

    const dispatch = await prisma.dispatch.findFirst();
    if (dispatch) {
      const res = await fetch(`http://localhost:3000/dispatch/${dispatch.id}`);
      console.log(`[DISPATCH DETAIL] /dispatch/${dispatch.id} -> Status ${res.status}`);
      if (res.status === 200) results.passed.push('/dispatch/[id]'); else results.failed.push({ page: `/dispatch/${dispatch.id}`, status: res.status });

      const resScan = await fetch(`http://localhost:3000/dispatch/${dispatch.id}/scan`);
      console.log(`[DISPATCH SCAN] /dispatch/${dispatch.id}/scan -> Status ${resScan.status}`);
      if (resScan.status === 200) results.passed.push('/dispatch/[id]/scan'); else results.failed.push({ page: `/dispatch/${dispatch.id}/scan`, status: resScan.status });
    }

    const po = await prisma.purchaseOrder.findFirst();
    if (po) {
      const res = await fetch(`http://localhost:3000/purchasing/${po.id}`);
      console.log(`[PO DETAIL] /purchasing/${po.id} -> Status ${res.status}`);
      if (res.status === 200) results.passed.push('/purchasing/[id]'); else results.failed.push({ page: `/purchasing/${po.id}`, status: res.status });

      const resRecv = await fetch(`http://localhost:3000/purchasing/${po.id}/receive`);
      console.log(`[PO RECEIVE] /purchasing/${po.id}/receive -> Status ${resRecv.status}`);
      if (resRecv.status === 200) results.passed.push('/purchasing/[id]/receive'); else results.failed.push({ page: `/purchasing/${po.id}/receive`, status: resRecv.status });
    }

    const ticket = await prisma.serviceTicket.findFirst();
    if (ticket) {
      const res = await fetch(`http://localhost:3000/service/${ticket.id}`);
      console.log(`[TICKET DETAIL] /service/${ticket.id} -> Status ${res.status}`);
      if (res.status === 200) results.passed.push('/service/[id]'); else results.failed.push({ page: `/service/${ticket.id}`, status: res.status });
    }

    const install = await prisma.installation.findFirst();
    if (install) {
      const resJob = await fetch(`http://localhost:3000/tech/jobs/${install.id}`);
      console.log(`[TECH JOB] /tech/jobs/${install.id} -> Status ${resJob.status}`);
      if (resJob.status === 200) results.passed.push('/tech/jobs/[id]'); else results.failed.push({ page: `/tech/jobs/${install.id}`, status: resJob.status });
    }

    const warranty = await prisma.warranty.findFirst({
      include: { unit: true }
    });
    if (warranty?.unit?.qr_code) {
      const resW = await fetch(`http://localhost:3000/w/${warranty.unit.qr_code}`);
      console.log(`[PUBLIC WARRANTY] /w/${warranty.unit.qr_code} -> Status ${resW.status}`);
      if (resW.status === 200) results.passed.push('/w/[code]'); else results.failed.push({ page: `/w/${warranty.unit.qr_code}`, status: resW.status });
    }
  } catch (err) {
    console.error('Dynamic page probe error:', err);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Passed checks: ${results.passed.length}`);
  console.log(`Failed checks: ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log('Failed:', results.failed);
  }
}

auditRealImplementation();

