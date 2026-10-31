import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const lead = await prisma.lead.findFirst();
  const quote = await prisma.quote.findFirst();
  const order = await prisma.order.findFirst();
  const dispatch = await prisma.dispatch.findFirst();
  const po = await prisma.purchaseOrder.findFirst();
  const ticket = await prisma.serviceTicket.findFirst();
  const inst = await prisma.installation.findFirst();
  const survey = await prisma.siteSurvey.findFirst();
  const warranty = await prisma.warranty.findFirst();

  console.log({
    leadId: lead?.id,
    quoteId: quote?.id,
    quoteToken: quote?.token,
    orderId: order?.id,
    dispatchId: dispatch?.id,
    poId: po?.id,
    ticketId: ticket?.id,
    instId: inst?.id,
    surveyId: survey?.id,
    warrantyCode: warranty?.warranty_number || warranty?.id,
  });

  const routesToTest = [];
  if (lead?.id) routesToTest.push({ name: `Lead Detail`, url: `http://localhost:3000/leads/${lead.id}` });
  if (quote?.id) routesToTest.push({ name: `Quote Detail`, url: `http://localhost:3000/quotes/${quote.id}` });
  if (quote?.id) routesToTest.push({ name: `Quote Public /q/`, url: `http://localhost:3000/q/${quote.id}` }); // or token
  if (order?.id) routesToTest.push({ name: `Order Detail`, url: `http://localhost:3000/orders/${order.id}` });
  if (dispatch?.id) {
    routesToTest.push({ name: `Dispatch Detail`, url: `http://localhost:3000/dispatch/${dispatch.id}` });
    routesToTest.push({ name: `Dispatch Scan`, url: `http://localhost:3000/dispatch/${dispatch.id}/scan` });
  }
  if (po?.id) {
    routesToTest.push({ name: `PO Detail`, url: `http://localhost:3000/purchasing/${po.id}` });
    routesToTest.push({ name: `PO Receive`, url: `http://localhost:3000/purchasing/${po.id}/receive` });
  }
  if (ticket?.id) routesToTest.push({ name: `Service Ticket Detail`, url: `http://localhost:3000/service/${ticket.id}` });
  if (inst?.id) routesToTest.push({ name: `Tech Job Stepper`, url: `http://localhost:3000/tech/jobs/${inst.id}` });
  if (survey?.id) routesToTest.push({ name: `Tech Survey Form`, url: `http://localhost:3000/tech/survey/${survey.id}` });
  if (warranty?.warranty_number) routesToTest.push({ name: `Warranty Public Lookup`, url: `http://localhost:3000/w/${warranty.warranty_number}` });

  console.log(`\nTesting ${routesToTest.length} dynamic routes...`);
  for (const r of routesToTest) {
    try {
      const res = await fetch(r.url);
      const text = await res.text();
      const isError = res.status >= 400 || text.includes('Internal Server Error') || text.includes('Application error');
      console.log(`[${res.status}] ${r.name.padEnd(25)} -> ${r.url} ${isError ? '❌ FAIL' : '✅ OK'}`);
      if (isError) {
        console.log(`   Error preview:`, text.slice(0, 300).replace(/\n/g, ' '));
      }
    } catch (err) {
      console.log(`[ERR] ${r.name.padEnd(25)} -> ${r.url} ❌ FAIL: ${err.message}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

