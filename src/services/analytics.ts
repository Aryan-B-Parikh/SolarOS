import { prisma } from '@/lib/db';

export async function getAnalyticsSummary() {
  const [orders, payments, expenses, leads] = await Promise.all([
    prisma.order.findMany(),
    prisma.payment.findMany(),
    prisma.expense.findMany(),
    prisma.lead.findMany(),
  ]);

  const totalRevenuePaise = orders.reduce((acc, o) => acc + (o.subtotal_paise - o.discount_paise), 0n);
  const totalCollectionsPaise = payments.reduce((acc, p) => acc + p.amount_paise, 0n);
  const totalExpensesPaise = expenses.reduce((acc, e) => acc + e.amount_paise, 0n);
  const grossProfitPaise = totalRevenuePaise - totalExpensesPaise;

  return {
    totalRevenuePaise: totalRevenuePaise.toString(),
    totalCollectionsPaise: totalCollectionsPaise.toString(),
    totalExpensesPaise: totalExpensesPaise.toString(),
    grossProfitPaise: grossProfitPaise.toString(),
    orderCount: orders.length,
    leadCount: leads.length,
  };
}

export async function getTopProfitJobs(limit = 5) {
  const orders = await prisma.order.findMany({
    include: {
      customer: true,
      expenses: true,
    },
    take: limit,
  });

  return orders.map((o) => {
    const netRevenue = o.subtotal_paise - o.discount_paise;
    const estMaterials = BigInt(Math.round(Number(netRevenue) * 0.62));
    const estLabour = BigInt(Math.round(Number(netRevenue) * 0.08));
    const exp = (o.expenses || []).reduce((acc, e) => acc + e.amount_paise, 0n);
    const profit = netRevenue - estMaterials - estLabour - exp;

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      customerName: o.customer.name,
      capacityKw: o.capacity_kw,
      installProfitPaise: profit.toString(),
      marginPercent: netRevenue > 0n ? ((Number(profit) / Number(netRevenue)) * 100).toFixed(1) : '0',
    };
  }).sort((a, b) => Number(b.installProfitPaise) - Number(a.installProfitPaise));
}

