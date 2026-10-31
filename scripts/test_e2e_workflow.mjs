import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function runE2E() {
  console.log('--- STARTING REAL INTEGRATION E2E TEST ---\n');

  // Step 1: Submit Public Enquiry
  console.log('1. Testing Public Enquiry Submission (POST /api/v1/public/enquiries)...');
  const enquiryPayload = {
    name: 'Ananya Sharma',
    phone: '9876543210',
    email: 'ananya.sharma@example.com',
    address: 'Flat 402, Sunshine Heights, SG Highway',
    city: 'Ahmedabad',
    pincode: '380015',
    monthly_bill_inr: 4500,
    consent: true,
  };

  const enquiryRes = await fetch(`${BASE_URL}/api/v1/public/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(enquiryPayload),
  });
  const enquiryData = await enquiryRes.json();
  console.log(`   Status: ${enquiryRes.status}, Response:`, enquiryData);
  if (enquiryRes.status !== 201 && enquiryRes.status !== 200) {
    throw new Error(`Enquiry submission failed: ${JSON.stringify(enquiryData)}`);
  }
  const leadId = enquiryData.leadId || enquiryData.lead?.id;
  console.log(`   ✅ Lead created: ${leadId}`);

  // Step 2: Check Lead Qualification
  console.log('\n2. Testing Lead Qualification (PATCH /api/v1/leads/[id])...');
  const qualifyRes = await fetch(`${BASE_URL}/api/v1/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roofAreaSqm: 50,
      monthlyBillRupees: 4500,
      monthlyUnits: 550,
      sanctionedLoadKw: 6,
      phase: 'THREE',
      gridOk: true,
    }),
  });
  const qualifyData = await qualifyRes.json();
  console.log(`   Status: ${qualifyRes.status}`);

  // Step 3: Outbox Cron Trigger
  console.log('\n3. Testing Outbox Worker Cron (POST /api/v1/cron/outbox)...');
  const outboxRes = await fetch(`${BASE_URL}/api/v1/cron/outbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const outboxData = await outboxRes.json();
  console.log(`   Status: ${outboxRes.status}, Processed:`, outboxData);

  // Step 4: Maintenance Cron Trigger
  console.log('\n4. Testing Maintenance Alert Cron (POST /api/v1/cron/maintenance)...');
  const maintRes = await fetch(`${BASE_URL}/api/v1/cron/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const maintData = await maintRes.json();
  console.log(`   Status: ${maintRes.status}, Result:`, maintData);

  // Step 5: Test Quote Generation from System Template
  console.log('\n5. Testing Quote BOM Calculation (POST /api/v1/quotes)...');
  const template = await prisma.systemTemplate.findFirst({
    where: { system_type: 'ON_GRID' },
  });
  const user = await prisma.user.findFirst({ where: { role: 'SALES' } });

  const quotePayload = {
    leadId: leadId,
    systemTemplateId: template.id,
    capacityKw: 5.0,
    basePricePaise: 27500000, // 2.75 Lakhs
    discountPaise: 1000000,   // 10k discount
    gstRatePercent: 13.8,
  };

  const quoteRes = await fetch(`${BASE_URL}/api/v1/quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': user.id,
      'x-user-role': user.role,
    },
    body: JSON.stringify(quotePayload),
  });
  const quoteData = await quoteRes.json();
  console.log(`   Status: ${quoteRes.status}, Quote:`, quoteData.quote?.quote_number || quoteData);

  console.log('\n--- REAL INTEGRATION E2E TEST COMPLETED ---');
}

runE2E().catch(console.error).finally(() => prisma.$disconnect());
