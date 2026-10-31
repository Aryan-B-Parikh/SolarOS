/**
 * SunPower Ops - Director Analytics & Financial Reporting Service (Spec 6.3 Phase 8, TRD 2.4, Rule C10, C11)
 * Full period KPI aggregation with IST boundaries, project profitability,
 * revenue trend, top-profit jobs, dashboard alerts, pending steps, technician pay,
 * and expiring read-only share links.
 */

import crypto from 'node:crypto';
import { prisma } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import {
  getISTPeriodRanges,
  getISTMonthRange,
  type AnalyticsPeriod,
  formatDateIST,
  businessHoursElapsedSince,
  LEAD_SLA_BUSINESS_HOURS,
} from '../lib/dates.ts';
import {
  calculateProjectProfitability,
  type ProjectProfitabilityResult,
  type OrderProfitabilityInput,
} from '../domain/profitability.ts';

const SHARE_LINK_SECRET = process.env.ACCESS_LINK_SECRET || 'sunpower-default-dev-secret-key-32chars!!';

export interface KpiTileMetric {
  valuePaise: string;
  priorValuePaise: string;
  deltaPaise: string;
  percentChange: number; // e.g. +12.4% or -5.1%
  isPositive: boolean;
}

export interface DashboardKpiSummary {
  period: AnalyticsPeriod;
  dateRange: {
    start: string;
    end: string;
  };
  revenue: KpiTileMetric;
  collections: KpiTileMetric;
  expenses: KpiTileMetric;
  grossProfit: KpiTileMetric;
  margin: {
    marginBp: number;
    marginPercent: string;
    priorMarginBp: number;
    priorMarginPercent: string;
    deltaBp: number;
  };
  counts: {
    ordersCount: number;
    pendingStepsCount: number;
    openTicketsCount: number;
    lowStockCount: number;
    lossMakingCount: number;
  };
}

export interface MonthlyTrendData {
  month: string; // YYYY-MM
  label: string; // e.g. "Oct 2026"
  revenuePaise: string;
  collectionsPaise: string;
  expensesPaise: string;
  grossProfitPaise: string;
}

export interface DashboardAlertsSummary {
  lossMakingJobs: Array<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    installProfitPaise: string;
    marginPercent: string;
  }>;
  expiringWarranties: Array<{
    warrantyId: string;
    unitId: string | null;
    serialNumber: string;
    productName: string;
    customerName: string;
    customerPhone: string;
    endDate: string;
    daysRemaining: number;
  }>;
  lowStockItems: Array<{
    productId: string;
    sku: string;
    productName: string;
    category: string;
    availableQty: number;
    reorderLevel: number;
  }>;
  uncontactedLeads: Array<{
    leadId: string;
    leadNumber: string;
    customerName: string;
    customerPhone: string;
    createdAt: string;
    hoursUncontacted: number;
  }>;
}

export interface TechnicianPaySummaryItem {
  technicianId: string;
  technicianName: string;
  technicianPhone: string;
  totalLoggedHours: number;
  hourlyCostPaise: string;
  totalPayablePaise: string;
  jobCount: number;
}

/**
 * Calculates percentage change between current and prior values.
 */
function calculatePercentageChange(current: bigint, prior: bigint): number {
  if (prior === 0n) {
    return current > 0n ? 100 : 0;
  }
  const diff = Number(current - prior);
  const base = Number(prior);
  return Math.round((diff / Math.abs(base)) * 1000) / 10;
}

/**
 * Aggregates outbound material cost from stock movements (Rule C10).
 *
 * FR-8.2 double-count fix: serialized units generate BOTH a DISPATCH
 * movement (line-level, warehouse -> vehicle, avg cost x full loaded qty,
 * unit_id NULL) AND a DELIVERY movement (per unit, unit_id set) when the
 * customer signs off. Counting both charges serialized hardware twice.
 * We therefore skip DELIVERY movements that carry a unit_id - the unit's
 * cost is already captured once by its DISPATCH movement. Bulk
 * (non-serialized) lines only ever get the DISPATCH movement, and RETURN
 * movements (with or without unit_id) credit stock back.
 */
export function aggregateMaterialsCostPaise(
  movements: Array<{ type: string; qty: any; unit_cost_paise: bigint; unit_id?: string | null }>
): bigint {
  let total = 0n;
  for (const sm of movements) {
    // Serialized unit delivered: cost already counted at DISPATCH. Skip.
    if (sm.type === 'DELIVERY' && sm.unit_id) continue;
    const multiplier = sm.type === 'RETURN' ? -1n : 1n;
    const qtyBig = BigInt(Math.round(Number(sm.qty)));
    total += multiplier * (qtyBig * sm.unit_cost_paise);
  }
  return total;
}

/**
 * Retrieves aggregate KPI metrics for Director Dashboard (Screen S19, Rule C10).
 */
export async function getKpiMetrics(
  period: AnalyticsPeriod = 'THIS_MONTH',
  customStart?: string,
  customEnd?: string,
  refDate: Date = new Date()
): Promise<DashboardKpiSummary> {
  const { start, end, priorStart, priorEnd } = getISTPeriodRanges(period, customStart, customEnd, refDate);

  // 1. Current Period queries
  const [
    currentOrders,
    currentPayments,
    currentExpenses,
    currentTimeLogs,
    currentDispatches,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        created_at: { gte: start, lte: end },
        status: { notIn: ['CANCELLED'] },
      },
      select: { subtotal_paise: true, discount_paise: true },
    }),
    prisma.payment.findMany({
      where: {
        received_on: { gte: start, lte: end },
        status: { in: ['RECORDED', 'VERIFIED'] },
      },
      select: { amount_paise: true },
    }),
    prisma.expense.findMany({
      where: {
        incurred_on: { gte: start, lte: end },
      },
      select: { amount_paise: true },
    }),
    prisma.timeLog.findMany({
      where: {
        ended_at: { gte: start, lte: end },
      },
      select: { started_at: true, ended_at: true, hourly_cost_paise: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        created_at: { gte: start, lte: end },
        type: { in: ['DISPATCH', 'DELIVERY', 'RETURN'] },
      },
      select: { type: true, qty: true, unit_cost_paise: true, unit_id: true },
    }),
  ]);

  // 2. Prior Period queries
  const [
    priorOrders,
    priorPayments,
    priorExpenses,
    priorTimeLogs,
    priorDispatches,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        created_at: { gte: priorStart, lte: priorEnd },
        status: { notIn: ['CANCELLED'] },
      },
      select: { subtotal_paise: true, discount_paise: true },
    }),
    prisma.payment.findMany({
      where: {
        received_on: { gte: priorStart, lte: priorEnd },
        status: { in: ['RECORDED', 'VERIFIED'] },
      },
      select: { amount_paise: true },
    }),
    prisma.expense.findMany({
      where: {
        incurred_on: { gte: priorStart, lte: priorEnd },
      },
      select: { amount_paise: true },
    }),
    prisma.timeLog.findMany({
      where: {
        ended_at: { gte: priorStart, lte: priorEnd },
      },
      select: { started_at: true, ended_at: true, hourly_cost_paise: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        created_at: { gte: priorStart, lte: priorEnd },
        type: { in: ['DISPATCH', 'DELIVERY', 'RETURN'] },
      },
      select: { type: true, qty: true, unit_cost_paise: true, unit_id: true },
    }),
  ]);

  // Current calculations
  const curRevenue = currentOrders.reduce((acc, o) => acc + (o.subtotal_paise - o.discount_paise), 0n);
  const curCollections = currentPayments.reduce((acc, p) => acc + p.amount_paise, 0n);
  const curExpenses = currentExpenses.reduce((acc, e) => acc + e.amount_paise, 0n);

  const curLabour = currentTimeLogs.reduce((acc, log) => {
    if (!log.ended_at) return acc;
    const durSec = Math.max(0, (log.ended_at.getTime() - log.started_at.getTime()) / 1000);
    return acc + (BigInt(Math.round(durSec)) * log.hourly_cost_paise) / 3600n;
  }, 0n);

  const curMaterials = aggregateMaterialsCostPaise(currentDispatches);

  const curGrossProfit = curRevenue - curMaterials - curLabour - curExpenses;
  const curMarginBp = curRevenue > 0n ? Number((curGrossProfit * 10000n) / curRevenue) : 0;

  // Prior calculations
  const priorRevenue = priorOrders.reduce((acc, o) => acc + (o.subtotal_paise - o.discount_paise), 0n);
  const priorCollections = priorPayments.reduce((acc, p) => acc + p.amount_paise, 0n);
  const priorExpensesTotal = priorExpenses.reduce((acc, e) => acc + e.amount_paise, 0n);

  const priorLabour = priorTimeLogs.reduce((acc, log) => {
    if (!log.ended_at) return acc;
    const durSec = Math.max(0, (log.ended_at.getTime() - log.started_at.getTime()) / 1000);
    return acc + (BigInt(Math.round(durSec)) * log.hourly_cost_paise) / 3600n;
  }, 0n);

  const priorMaterials = aggregateMaterialsCostPaise(priorDispatches);

  const priorGrossProfit = priorRevenue - priorMaterials - priorLabour - priorExpensesTotal;
  const priorMarginBp = priorRevenue > 0n ? Number((priorGrossProfit * 10000n) / priorRevenue) : 0;

  // Extra counts for dashboard
  const [pendingLeads, pendingOrders, openTickets, lossOrders, allLevels] = await Promise.all([
    prisma.lead.count({ where: { status: { notIn: ['WON', 'LOST', 'DISQUALIFIED'] } } }),
    prisma.order.count({ where: { status: { notIn: ['INSTALLED', 'CANCELLED'] } } }),
    prisma.serviceTicket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    prisma.order.findMany({
      where: {
        created_at: { gte: start, lte: end },
        status: { notIn: ['CANCELLED'] },
      },
      include: {
        customer: { select: { id: true, name: true } },
        expenses: { select: { amount_paise: true } },
        dispatches: { select: { id: true } },
        installation: {
          include: {
            time_logs: {
              select: { started_at: true, ended_at: true, hourly_cost_paise: true },
            },
          },
        },
      },
    }),
    prisma.stockLevel.findMany({
      include: { product: { select: { reorder_level: true, is_active: true } } },
    }),
  ]);

  const lowStockProducts = new Set(
    allLevels
      .filter((sl) => sl.product.is_active && Number(sl.on_hand) - Number(sl.reserved) <= Number(sl.product.reorder_level))
      .map((sl) => sl.product_id)
  ).size;

  // Compute loss-making jobs in current period
  let lossCount = 0;
  for (const o of lossOrders) {
    const netRev = o.subtotal_paise - o.discount_paise;
    const exp = o.expenses.reduce((acc, e) => acc + e.amount_paise, 0n);
    const lab = (o.installation?.time_logs || []).reduce((acc, l) => {
      if (!l.ended_at) return acc;
      const sec = Math.max(0, (l.ended_at.getTime() - l.started_at.getTime()) / 1000);
      return acc + (BigInt(Math.round(sec)) * l.hourly_cost_paise) / 3600n;
    }, 0n);

    if (netRev - lab - exp < 0n) {
      lossCount++;
    }
  }

  const buildKpi = (cur: bigint, prior: bigint): KpiTileMetric => ({
    valuePaise: cur.toString(),
    priorValuePaise: prior.toString(),
    deltaPaise: (cur - prior).toString(),
    percentChange: calculatePercentageChange(cur, prior),
    isPositive: cur >= prior,
  });

  return {
    period,
    dateRange: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    revenue: buildKpi(curRevenue, priorRevenue),
    collections: buildKpi(curCollections, priorCollections),
    expenses: buildKpi(curExpenses, priorExpensesTotal),
    grossProfit: buildKpi(curGrossProfit, priorGrossProfit),
    margin: {
      marginBp: curMarginBp,
      marginPercent: curRevenue > 0n ? (curMarginBp / 100).toFixed(1) + '%' : '0.0%',
      priorMarginBp,
      priorMarginPercent: priorRevenue > 0n ? (priorMarginBp / 100).toFixed(1) + '%' : '0.0%',
      deltaBp: curMarginBp - priorMarginBp,
    },
    counts: {
      ordersCount: currentOrders.length,
      pendingStepsCount: pendingLeads + pendingOrders + openTickets,
      openTicketsCount: openTickets,
      lowStockCount: lowStockProducts,
      lossMakingCount: lossCount,
    },
  };
}

/**
 * Returns sortable project profitability list (Screen S19, Rule C10).
 * Hand-calculated down to the paisa.
 */
export async function getProjectProfitabilityList(filters?: {
  period?: AnalyticsPeriod;
  customStart?: string;
  customEnd?: string;
  status?: string;
  isLossOnly?: boolean;
  limit?: number;
}): Promise<ProjectProfitabilityResult[]> {
  let dateFilter: any = {};
  if (filters?.period) {
    const { start, end } = getISTPeriodRanges(filters.period, filters.customStart, filters.customEnd);
    dateFilter = { created_at: { gte: start, lte: end } };
  }

  const orders = await prisma.order.findMany({
    where: {
      ...dateFilter,
      ...(filters?.status ? { status: filters.status as any } : {}),
      status: { notIn: ['CANCELLED'] },
    },
    include: {
      customer: { select: { id: true, name: true } },
      expenses: { select: { amount_paise: true } },
      dispatches: {
        select: { id: true },
      },
      installation: {
        include: {
          time_logs: {
            select: { started_at: true, ended_at: true, hourly_cost_paise: true },
          },
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: filters?.limit || 100,
  });

  const allDispatchIds = orders.flatMap((o) => o.dispatches.map((d) => d.id));
  const rawMovements = allDispatchIds.length > 0 ? await prisma.stockMovement.findMany({
    where: {
      ref_type: 'dispatch',
      ref_id: { in: allDispatchIds },
      type: { in: ['DISPATCH', 'RETURN'] },
    },
    select: { ref_id: true, type: true, qty: true, unit_cost_paise: true },
  }) : [];

  const movementsByDispatch = new Map<string, Array<{ type: any; qty: any; unitCostPaise: bigint }>>();
  for (const sm of rawMovements) {
    if (!movementsByDispatch.has(sm.ref_id)) {
      movementsByDispatch.set(sm.ref_id, []);
    }
    movementsByDispatch.get(sm.ref_id)!.push({
      type: sm.type,
      qty: sm.qty,
      unitCostPaise: sm.unit_cost_paise,
    });
  }

  const results: ProjectProfitabilityResult[] = orders.map((o) => {
    const movements: any[] = [];
    for (const d of o.dispatches) {
      const dMoves = movementsByDispatch.get(d.id) || [];
      movements.push(...dMoves);
    }

    const timeLogs: any[] = (o.installation?.time_logs || []).map((tl) => ({
      startedAt: tl.started_at,
      endedAt: tl.ended_at,
      hourlyCostPaise: tl.hourly_cost_paise,
    }));

    const expenses: any[] = (o.expenses || []).map((e) => ({
      amountPaise: e.amount_paise,
    }));

    return calculateProjectProfitability({
      orderId: o.id,
      orderNumber: o.order_number,
      customerId: o.customer_id,
      customerName: o.customer.name,
      status: o.status,
      subtotalPaise: o.subtotal_paise,
      discountPaise: o.discount_paise,
      stockMovements: movements,
      timeLogs,
      expenses,
    });
  });

  if (filters?.isLossOnly) {
    return results.filter((p) => p.isLoss);
  }

  return results;
}

/**
 * Returns 6-month revenue, collections, and gross profit trend (v_revenue_trend, Rule C10).
 */
export async function getRevenueTrend(monthsBack = 6): Promise<MonthlyTrendData[]> {
  const trend: MonthlyTrendData[] = [];
  const today = new Date();
  const istDate = new Date(today.getTime() + 5.5 * 3600 * 1000);
  let curYear = istDate.getUTCFullYear();
  let curMonth = istDate.getUTCMonth() + 1; // 1-12

  for (let i = 0; i < monthsBack; i++) {
    const { start, end } = getISTMonthRange(curYear, curMonth);
    const monthKey = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    const labelDate = new Date(Date.UTC(curYear, curMonth - 1, 15));
    const label = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(labelDate);

    const [orders, payments, expenses, timeLogs, dispatches] = await Promise.all([
      prisma.order.findMany({
        where: { created_at: { gte: start, lte: end }, status: { notIn: ['CANCELLED'] } },
        select: { subtotal_paise: true, discount_paise: true },
      }),
      prisma.payment.findMany({
        where: { received_on: { gte: start, lte: end }, status: { in: ['RECORDED', 'VERIFIED'] } },
        select: { amount_paise: true },
      }),
      prisma.expense.findMany({
        where: { incurred_on: { gte: start, lte: end } },
        select: { amount_paise: true },
      }),
      prisma.timeLog.findMany({
        where: { ended_at: { gte: start, lte: end } },
        select: { started_at: true, ended_at: true, hourly_cost_paise: true },
      }),
      prisma.stockMovement.findMany({
        where: { created_at: { gte: start, lte: end }, type: { in: ['DISPATCH', 'DELIVERY', 'RETURN'] } },
        select: { type: true, qty: true, unit_cost_paise: true, unit_id: true },
      }),
    ]);

    const revenue = orders.reduce((acc, o) => acc + (o.subtotal_paise - o.discount_paise), 0n);
    const collections = payments.reduce((acc, p) => acc + p.amount_paise, 0n);
    const exp = expenses.reduce((acc, e) => acc + e.amount_paise, 0n);

    const labour = timeLogs.reduce((acc, l) => {
      if (!l.ended_at) return acc;
      const sec = Math.max(0, (l.ended_at.getTime() - l.started_at.getTime()) / 1000);
      return acc + (BigInt(Math.round(sec)) * l.hourly_cost_paise) / 3600n;
    }, 0n);

    // Serialized unit cost counted once (see aggregateMaterialsCostPaise).
    const materials = aggregateMaterialsCostPaise(dispatches);

    const grossProfit = revenue - materials - labour - exp;

    trend.unshift({
      month: monthKey,
      label,
      revenuePaise: revenue.toString(),
      collectionsPaise: collections.toString(),
      expensesPaise: exp.toString(),
      grossProfitPaise: grossProfit.toString(),
    });

    curMonth--;
    if (curMonth < 1) {
      curMonth = 12;
      curYear--;
    }
  }

  return trend;
}

/**
 * Returns Top-Profit Jobs (sorted by install_profit_paise descending).
 */
export async function getTopProfitJobs(limit = 5): Promise<ProjectProfitabilityResult[]> {
  const projects = await getProjectProfitabilityList({ limit: 100 });
  return projects.sort((a, b) => Number(b.installProfitPaise - a.installProfitPaise)).slice(0, limit);
}

/**
 * Returns Dashboard Alerts Widget data:
 * 1. Loss-making jobs (in red)
 * 2. Expiring warranties in next 60 days
 * 3. Low stock items
 * 4. Uncontacted leads for > 4 business hours
 */
export async function getDashboardAlerts(): Promise<DashboardAlertsSummary> {
  const now = new Date();
  const sixtyDaysFuture = new Date(now.getTime() + 60 * 24 * 3600 * 1000);

  const [lossProjects, expiringWarranties, lowStockLevels, uncontactedLeadsRaw] = await Promise.all([
    getProjectProfitabilityList({ isLossOnly: true, limit: 10 }),
    prisma.warranty.findMany({
      where: {
        status: 'ACTIVE',
        end_date: { gte: now, lte: sixtyDaysFuture },
      },
      include: {
        product: true,
        unit: true,
        customer: true,
      },
      orderBy: { end_date: 'asc' },
      take: 10,
    }),
    prisma.stockLevel.findMany({
      where: {
        product: { is_active: true },
      },
      include: { product: true },
    }),
    // Pre-filter: leads at least 4 calendar hours old (necessary lower bound
    // since business hours are a subset of clock hours), then the exact
    // business-hours check is applied below.
    prisma.lead.findMany({
      where: {
        status: 'NEW',
        created_at: { lte: new Date(now.getTime() - LEAD_SLA_BUSINESS_HOURS * 3600 * 1000) },
      },
      include: { customer: true },
      orderBy: { created_at: 'asc' },
      take: 50,
    }),
  ]);

  // Uncontacted leads: >= 4 BUSINESS hours since creation (FR-1.6).
  const uncontactedLeads = uncontactedLeadsRaw
    .filter((l) => businessHoursElapsedSince(l.created_at, now) >= LEAD_SLA_BUSINESS_HOURS)
    .slice(0, 10);

  // Format low stock
  const lowStockItems = lowStockLevels
    .filter((sl) => Number(sl.on_hand) - Number(sl.reserved) <= Number(sl.product.reorder_level))
    .map((sl) => ({
      productId: sl.product_id,
      sku: sl.product.sku,
      productName: sl.product.name,
      category: sl.product.category,
      availableQty: Number(sl.on_hand) - Number(sl.reserved),
      reorderLevel: Number(sl.product.reorder_level),
    }));

  return {
    lossMakingJobs: lossProjects.map((p) => ({
      orderId: p.orderId,
      orderNumber: p.orderNumber,
      customerName: p.customerName || 'Customer',
      installProfitPaise: p.installProfitPaise.toString(),
      marginPercent: p.marginPercent,
    })),
    expiringWarranties: expiringWarranties.map((w) => {
      const remainingDays = Math.max(0, Math.round((w.end_date.getTime() - now.getTime()) / (86400 * 1000)));
      return {
        warrantyId: w.id,
        unitId: w.unit_id,
        serialNumber: w.unit?.serial_number || 'N/A',
        productName: w.product?.name || 'Component',
        customerName: w.customer.name,
        customerPhone: w.customer.phone,
        endDate: w.end_date.toISOString().split('T')[0],
        daysRemaining: remainingDays,
      };
    }),
    lowStockItems,
    uncontactedLeads: uncontactedLeads.map((l) => {
      const hours = Math.round(businessHoursElapsedSince(l.created_at, now));
      return {
        leadId: l.id,
        leadNumber: l.lead_number,
        customerName: l.customer.name,
        customerPhone: l.customer.phone,
        createdAt: l.created_at.toISOString(),
        hoursUncontacted: hours,
      };
    }),
  };
}

/**
 * Returns Pending Steps grouped by stage with age in days (v_pending_steps, Rule C10).
 */
export async function getPendingSteps() {
  const now = new Date();

  const [leads, orders, tickets] = await Promise.all([
    prisma.lead.findMany({
      where: { status: { notIn: ['WON', 'LOST', 'DISQUALIFIED'] } },
      include: { customer: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { created_at: 'asc' },
    }),
    prisma.order.findMany({
      where: { status: { notIn: ['INSTALLED', 'CANCELLED'] } },
      include: { customer: { select: { name: true } } },
      orderBy: { created_at: 'asc' },
    }),
    prisma.serviceTicket.findMany({
      where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      include: { customer: { select: { name: true } }, assignee: { select: { name: true } } },
      orderBy: { created_at: 'asc' },
    }),
  ]);

  const items = [
    ...leads.map((l) => ({
      entityType: 'LEAD',
      id: l.id,
      number: l.lead_number,
      title: `${l.customer.name} (${Number(l.requested_capacity_kw)} kW)`,
      stage: l.status,
      ageDays: Math.floor((now.getTime() - l.updated_at.getTime()) / (86400 * 1000)),
      assigneeName: l.owner?.name || 'Unassigned',
    })),
    ...orders.map((o) => ({
      entityType: 'ORDER',
      id: o.id,
      number: o.order_number,
      title: `${o.customer.name} - ${o.system_type}`,
      stage: o.status,
      ageDays: Math.floor((now.getTime() - o.updated_at.getTime()) / (86400 * 1000)),
      assigneeName: 'Ops Team',
    })),
    ...tickets.map((t) => ({
      entityType: 'TICKET',
      id: t.id,
      number: t.ticket_number,
      title: `${t.customer.name} - ${t.category}`,
      stage: t.status,
      ageDays: Math.floor((now.getTime() - t.created_at.getTime()) / (86400 * 1000)),
      assigneeName: t.assignee?.name || 'Unassigned',
    })),
  ];

  return items.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Returns Technician Hours and Payable summary (Rule C11).
 */
export async function getTechnicianPaySummary(period: AnalyticsPeriod = 'THIS_MONTH'): Promise<TechnicianPaySummaryItem[]> {
  const { start, end } = getISTPeriodRanges(period);

  const logs = await prisma.timeLog.findMany({
    where: {
      ended_at: { gte: start, lte: end },
    },
    include: {
      technician: {
        include: { user: true },
      },
    },
  });

  const payMap: Record<
    string,
    {
      userId: string;
      name: string;
      phone: string;
      totalSeconds: number;
      hourlyCostPaise: bigint;
      jobIds: Set<string>;
    }
  > = {};

  for (const log of logs) {
    if (!log.ended_at) continue;
    const techId = log.technician.user_id;
    if (!payMap[techId]) {
      payMap[techId] = {
        userId: techId,
        name: log.technician.user.name,
        phone: log.technician.user.phone || '',
        totalSeconds: 0,
        hourlyCostPaise: log.hourly_cost_paise,
        jobIds: new Set(),
      };
    }

    const durationSec = Math.max(0, (log.ended_at.getTime() - log.started_at.getTime()) / 1000);
    payMap[techId].totalSeconds += durationSec;
    if (log.installation_id) payMap[techId].jobIds.add(log.installation_id);
  }

  return Object.values(payMap).map((t) => {
    const totalHours = Math.round((t.totalSeconds / 3600) * 10) / 10;
    const payablePaise = (BigInt(Math.round(t.totalSeconds)) * t.hourlyCostPaise) / 3600n;
    return {
      technicianId: t.userId,
      technicianName: t.name,
      technicianPhone: t.phone,
      totalLoggedHours: totalHours,
      hourlyCostPaise: t.hourlyCostPaise.toString(),
      totalPayablePaise: payablePaise.toString(),
      jobCount: t.jobIds.size,
    };
  });
}

/**
 * Generates an expiring, tamper-proof read-only dashboard share link.
 * Acceptance: a share link is read-only and stops working after expiry.
 */
export function createDashboardShareToken(
  period: AnalyticsPeriod = 'THIS_MONTH',
  durationHours: number = 24,
  secret: string = SHARE_LINK_SECRET
): { token: string; expiresAt: Date; shareUrl: string } {
  const expiresAtMs = Date.now() + durationHours * 3600 * 1000;
  const expiresAt = new Date(expiresAtMs);

  const payload = {
    type: 'DASHBOARD_SHARE',
    period,
    expiresAt: expiresAtMs,
    issuedAt: Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const token = `${payloadB64}.${signature}`;

  return {
    token,
    expiresAt,
    // Read-only public view (FR-8.6): app/(public)/shared/[token]/page.tsx
    shareUrl: `/shared/${token}`,
  };
}

/**
 * Validates a dashboard share link token.
 * Returns payload if valid and unexpired; throws AppError if invalid or expired.
 */
export function verifyDashboardShareToken(
  token: string,
  secret: string = SHARE_LINK_SECRET
): { period: AnalyticsPeriod; expiresAt: Date; isExpired: boolean } {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new AppError('VALIDATION_FAILED', 'Invalid share token format', 400);
  }

  const [payloadB64, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  if (signature !== expectedSignature) {
    throw new AppError('FORBIDDEN', 'Invalid share token signature', 403);
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Malformed share token payload', 400);
  }

  if (payload.type !== 'DASHBOARD_SHARE') {
    throw new AppError('FORBIDDEN', 'Token is not a dashboard share link', 403);
  }

  const isExpired = Date.now() > payload.expiresAt;
  if (isExpired) {
    throw new AppError('LINK_EXPIRED', 'This dashboard share link has expired and is no longer accessible', 410);
  }

  return {
    period: payload.period as AnalyticsPeriod,
    expiresAt: new Date(payload.expiresAt),
    isExpired: false,
  };
}

/**
 * Full dashboard summary used by GET /api/v1/analytics/summary:
 * KPI tiles for today / this week / this month plus alert lists.
 * (FR-8.1, C10)
 */
export async function getAnalyticsSummary(): Promise<{
  today: DashboardKpiSummary;
  thisWeek: DashboardKpiSummary;
  thisMonth: DashboardKpiSummary;
  alerts: DashboardAlertsSummary;
}> {
  const [today, thisWeek, thisMonth, alerts] = await Promise.all([
    getKpiMetrics('TODAY'),
    getKpiMetrics('THIS_WEEK'),
    getKpiMetrics('THIS_MONTH'),
    getDashboardAlerts(),
  ]);

  return { today, thisWeek, thisMonth, alerts };
}

export interface SubsidySummaryItem {
  subsidyId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  capacityKw: number;
  status:
    | 'NOT_STARTED'
    | 'SUBMITTED'
    | 'UNDER_INSPECTION'
    | 'APPROVED'
    | 'DISBURSED'
    | 'REJECTED';
  applicationRef: string | null;
  expectedPaise: string;
  receivedPaise: string;
  submittedOn: string | null;
  disbursedOn: string | null;
}

/**
 * Subsidy application tracker for the Accounts screen (FR-4.8 / C11).
 * Real rows from subsidy_applications joined to their orders + customers.
 */
export async function getSubsidySummary(status?: string): Promise<SubsidySummaryItem[]> {
  const applications = await prisma.subsidyApplication.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      order: {
        include: { customer: { select: { name: true } } },
      },
    },
    orderBy: { updated_at: 'desc' },
    take: 200,
  });

  return applications.map((s) => ({
    subsidyId: s.id,
    orderId: s.order_id,
    orderNumber: s.order.order_number,
    customerName: s.order.customer?.name || 'Customer',
    capacityKw: Number(s.order.capacity_kw),
    status: s.status,
    applicationRef: s.application_ref,
    expectedPaise: s.expected_paise.toString(),
    receivedPaise: s.received_paise.toString(),
    submittedOn: s.submitted_on ? s.submitted_on.toISOString().split('T')[0] : null,
    disbursedOn: s.disbursed_on ? s.disbursed_on.toISOString().split('T')[0] : null,
  }));
}
