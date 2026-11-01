// Analytics service (C10, C11, FR-8.x): KPI tiles per period, profit per project
// (v_project_profitability in application code), revenue trend, top-profit jobs,
// alerts widget, pending steps and technician pay summaries.

import { db } from '@/lib/db'
import { periodBounds, monthKey, monthBounds, istToday, toIstDateString, fromIstDateString, monthLabel } from '@/lib/dates'
import { endOfIstDay } from '@/lib/tz'

export async function dashboard(period: 'today' | 'week' | 'month' | 'all' | 'custom' = 'month', range?: { from: string; to: string }) {
  const bounds = period === 'all'
    ? { from: '2000-01-01', to: '2099-12-31' }
    : period === 'custom' && range?.from && range?.to
      ? { from: range.from, to: range.to } // FR-8.1 custom date range
      : periodBounds(period === 'custom' ? 'month' : period)
  // IST day boundaries (D9): "today" runs from IST midnight to IST midnight,
  // so early-morning activity (00:00–05:30 IST) counts on the right day.
  const from = fromIstDateString(bounds.from)
  const to = endOfIstDay(bounds.to)

  const [orders, payments, expenses, timeLogs, tickets, leads, lowStockRows, outboxDead] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      include: { customer: true, lines: true, installation: true },
    }),
    db.payment.findMany({ where: { receivedOn: { gte: bounds.from, lte: bounds.to }, status: 'RECEIVED' } }),
    db.expense.findMany({ where: { incurredOn: { gte: bounds.from, lte: bounds.to } } }),
    db.timeLog.findMany({ where: { startedAt: { gte: from, lte: to } } }),
    db.serviceTicket.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { customer: true } }),
    db.lead.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { customer: true } }),
    lowStock(),
    db.outbox.count({ where: { status: 'DEAD' } }),
  ])

  // profitability per order (TRD 2.4): net revenue - materials - labour - expenses
  const dispatchMovements = await db.stockMovement.findMany({ where: { type: { in: ['DISPATCH', 'RETURN'] } } })
  const materialsByOrder = new Map<string, number>()
  const dispatches = await db.dispatch.findMany({ select: { id: true, orderId: true } })
  const dispatchOrder = new Map(dispatches.map((d) => [d.id, d.orderId]))
  for (const m of dispatchMovements) {
    if (m.refType !== 'dispatch') continue
    const orderId = dispatchOrder.get(m.refId)
    if (!orderId) continue
    const sign = m.type === 'DISPATCH' ? 1 : -1
    materialsByOrder.set(orderId, (materialsByOrder.get(orderId) ?? 0) + sign * m.qty * m.unitCostPaise)
  }
  const labourByOrder = new Map<string, number>()
  const installByOrder = new Map((await db.installation.findMany({ select: { id: true, orderId: true } })).map((i) => [i.id, i.orderId]))
  for (const tl of timeLogs) {
    if (!tl.installationId) continue
    const orderId = installByOrder.get(tl.installationId)
    if (!orderId) continue
    const hrs = tl.endedAt ? (tl.endedAt.getTime() - tl.startedAt.getTime()) / 3600000 : 0
    labourByOrder.set(orderId, (labourByOrder.get(orderId) ?? 0) + hrs * tl.hourlyCostPaise)
  }
  const expensesByOrder = new Map<string, number>()
  for (const e of expenses) {
    if (e.orderId) expensesByOrder.set(e.orderId, (expensesByOrder.get(e.orderId) ?? 0) + e.amountPaise)
  }

  const profitability = orders.map((o) => {
    const netRevenue = o.subtotalPaise - o.discountPaise
    const materials = materialsByOrder.get(o.id) ?? 0
    const labour = labourByOrder.get(o.id) ?? 0
    const exp = expensesByOrder.get(o.id) ?? 0
    const profit = netRevenue - materials - labour - exp
    return {
      orderId: o.id, orderNumber: o.orderNumber, customer: o.customer.name,
      status: o.status, capacityKw: o.capacityKw, netRevenue, materials, labour, expenses: exp,
      profit, marginBp: netRevenue > 0 ? Math.round((profit / netRevenue) * 10000) : 0,
    }
  })

  const revenue = orders.reduce((s, o) => s + o.subtotalPaise - o.discountPaise, 0)
  const collections = payments.reduce((s, p) => s + p.amountPaise, 0)
  const expenseTotal = expenses.reduce((s, e) => s + e.amountPaise, 0) + [...labourByOrder.values()].reduce((a, b) => a + b, 0)
  const grossProfit = revenue - (profitability.reduce((s, p) => s + p.materials, 0) + expenseTotal)
  const lossMaking = profitability.filter((p) => p.profit < 0)

  // revenue trend by month (last 8 months, IST calendar months)
  const allOrders = await db.order.findMany({ where: { status: { not: 'CANCELLED' } }, select: { subtotalPaise: true, discountPaise: true, createdAt: true } })
  const trendMap = new Map<string, { revenue: number; orders: number }>()
  const shiftMonth = (key: string, delta: number): string => {
    const [y, m] = key.split('-').map(Number)
    const t = y * 12 + (m - 1) + delta
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
  }
  const nowKey = monthKey(istToday())
  for (let i = 7; i >= 0; i--) {
    trendMap.set(shiftMonth(nowKey, -i), { revenue: 0, orders: 0 })
  }
  for (const o of allOrders) {
    const key = toIstDateString(o.createdAt).slice(0, 7) // IST month bucket
    const entry = trendMap.get(key)
    if (entry) {
      entry.revenue += o.subtotalPaise - o.discountPaise
      entry.orders++
    }
  }
  const trend = [...trendMap.entries()].map(([key, v]) => ({ month: monthLabel(key), revenuePaise: v.revenue, orders: v.orders }))

  // pipeline by stage
  const allLeads = await db.lead.findMany({ select: { status: true } })
  const pipeline: Record<string, number> = {}
  for (const l of allLeads) pipeline[l.status] = (pipeline[l.status] ?? 0) + 1

  // pending steps by stage (v_pending_steps): open leads, orders in flight, open tickets
  const openLeads = await db.lead.findMany({
    where: { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'SURVEY_APPROVED', 'QUOTED'] } },
    include: { customer: true },
    orderBy: { createdAt: 'asc' },
  })
  const inFlightOrders = await db.order.findMany({
    where: { status: { in: ['PENDING_ADVANCE', 'CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'INSTALLED'] } },
    include: { customer: true },
  })
  const openTickets = await db.serviceTicket.findMany({
    where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'] } },
    include: { customer: true, unit: { include: { product: true } } },
    orderBy: { slaDueAt: 'asc' },
  })

  const todayStr = istToday()
  const slaOverdueLeads = openLeads.filter((l) => l.status === 'NEW' && l.slaDueAt < new Date())
  const uncontactedLeads = openLeads.filter((l) => !l.firstContactedAt && l.createdAt < new Date(Date.now() - 4 * 3600 * 1000))

  // expiring warranties (within 60 days)
  const warranties = await db.warranty.findMany({ where: { status: 'ACTIVE' }, include: { unit: { include: { product: true } }, customer: true } })
  const expiringWarranties = warranties
    .map((w) => ({ ...w, daysLeft: Math.round((new Date(w.endDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000) }))
    .filter((w) => w.daysLeft <= 60 && w.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  return {
    period,
    bounds,
    kpis: {
      revenuePaise: revenue,
      collectionsPaise: collections,
      expensesPaise: expenseTotal,
      grossProfitPaise: grossProfit,
      marginBp: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) : 0,
      ordersCount: orders.length,
    },
    profitability: profitability.sort((a, b) => b.profit - a.profit),
    topProfitJobs: profitability.sort((a, b) => b.profit - a.profit).slice(0, 5),
    lossMaking,
    trend,
    pipeline,
    pendingSteps: {
      leads: openLeads.map((l) => ({ id: l.id, number: l.leadNumber, customer: l.customer.name, status: l.status, daysInStage: Math.max(0, Math.round((Date.now() - l.createdAt.getTime()) / 86400000)) })),
      orders: inFlightOrders.map((o) => ({ id: o.id, number: o.orderNumber, customer: o.customer.name, status: o.status })),
      tickets: openTickets.map((t) => ({ id: t.id, number: t.ticketNumber, customer: t.customer.name, status: t.status, verdict: t.warrantyVerdict, slaDueAt: t.slaDueAt, unit: t.unit?.product.name ?? null })),
    },
    alerts: {
      lossMakingJobs: lossMaking.map((l) => ({ number: l.orderNumber, customer: l.customer, profit: l.profit })),
      expiringWarranties: expiringWarranties.slice(0, 6).map((w) => ({ unit: w.unit?.product.name ?? 'Unit', serial: w.unit?.serialNumber, customer: w.customer.name, daysLeft: w.daysLeft, endDate: w.endDate })),
      lowStock: lowStockRows,
      uncontactedLeads: uncontactedLeads.map((l) => ({ number: l.leadNumber, customer: l.customer.name })),
      slaOverdue: slaOverdueLeads.map((l) => ({ number: l.leadNumber, customer: l.customer.name })),
      deadMessages: outboxDead,
    },
  }
}

async function lowStock() {
  const products = await db.product.findMany({ where: { isActive: true }, include: { stockLevels: true } })
  return products
    .map((p) => {
      const level = p.stockLevels[0]
      const available = (level?.onHand ?? 0) - (level?.reserved ?? 0)
      return { id: p.id, name: p.name, available, reorderLevel: p.reorderLevel, low: available < p.reorderLevel }
    })
    .filter((r) => r.low)
}

export async function technicianPaySummary(month: string) {
  // IST month boundaries (D9): pay periods are IST calendar months
  const b = monthBounds(month)
  const from = fromIstDateString(b.from)
  const to = endOfIstDay(b.to)
  const logs = await db.timeLog.findMany({
    where: { startedAt: { gte: from, lte: to } },
    include: { technician: { include: { user: true } } },
  })
  const byTech = new Map<string, { name: string; hours: number; payablePaise: number }>()
  for (const l of logs) {
    const hrs = l.endedAt ? (l.endedAt.getTime() - l.startedAt.getTime()) / 3600000 : 0
    const entry = byTech.get(l.technicianId) ?? { name: l.technician.user.name, hours: 0, payablePaise: 0 }
    entry.hours += hrs
    entry.payablePaise += Math.round(hrs * l.hourlyCostPaise)
    byTech.set(l.technicianId, entry)
  }
  return [...byTech.values()].map((t) => ({ ...t, hours: Math.round(t.hours * 10) / 10 })).sort((a, b) => b.payablePaise - a.payablePaise)
}

export async function accountsOverview() {
  const [invoices, payments, expenses, subsidies] = await Promise.all([
    db.invoice.findMany({ include: { customer: true }, orderBy: { issueDate: 'desc' } }),
    db.payment.findMany({ include: { order: true } }),
    db.expense.findMany({ orderBy: { incurredOn: 'desc' } }),
    db.subsidyApplication.findMany({ include: { order: { include: { customer: true } } } }),
  ])
  const receivables = invoices
    .filter((i) => i.status === 'ISSUED')
    .map((i) => ({ id: i.id, number: i.invoiceNumber, customer: i.customer.name, totalPaise: i.totalPaise, issueDate: i.issueDate, dueDate: i.dueDate, ageDays: Math.max(0, Math.round((Date.now() - new Date(i.issueDate + 'T00:00:00').getTime()) / 86400000)) }))
  return { invoices, payments, expenses, subsidies, receivables }
}

export async function recordExpense(input: { category: string; amountPaise: number; incurredOn: string; description?: string; orderId?: string | null; actorId: string }) {
  const expense = await db.expense.create({
    data: {
      category: input.category, amountPaise: input.amountPaise, incurredOn: input.incurredOn,
      description: input.description ?? null, orderId: input.orderId ?? null, recordedBy: input.actorId,
    },
  })
  return expense
}

export async function notificationsFeed() {
  const messages = await db.outbox.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return messages.map((m) => ({ ...m, payload: JSON.parse(m.payload) }))
}

export async function maintenanceRun() {
  const { runMaintenanceRules } = await import('@/services/maintenance')
  return runMaintenanceRules()
}
