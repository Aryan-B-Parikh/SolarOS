/**
 * SunPower Ops - Project Profitability & Financial Math Engine (Spec 6.3 Phase 8, TRD 2.4, Rule C10)
 * Computes net revenue, dispatched materials cost, logged labour cost, expenses, install profit,
 * and basis-point margins matching v_project_profitability down to the paisa.
 */

export interface StockMovementItem {
  type: 'DISPATCH' | 'RETURN' | string;
  qty: number | bigint;
  unitCostPaise: bigint;
}

export interface TimeLogItem {
  startedAt: Date | string;
  endedAt?: Date | string | null;
  hourlyCostPaise: bigint;
}

export interface ExpenseItem {
  amountPaise: bigint;
}

export interface OrderProfitabilityInput {
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName?: string;
  status: string;
  subtotalPaise: bigint;
  discountPaise: bigint;
  stockMovements?: StockMovementItem[];
  timeLogs?: TimeLogItem[];
  expenses?: ExpenseItem[];
}

export interface ProjectProfitabilityResult {
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName?: string;
  status: string;
  netRevenuePaise: bigint;
  materialsPaise: bigint;
  labourPaise: bigint;
  expensesPaise: bigint;
  installProfitPaise: bigint;
  marginBp: number; // Basis points (100 bp = 1%)
  marginPercent: string; // E.g. "18.5%"
  isLoss: boolean;
}

/**
 * Calculates dispatched materials cost from stock movements.
 * Net cost = (DISPATCH qty * unit_cost) - (RETURN qty * unit_cost).
 */
export function calculateMaterialsCostPaise(movements: StockMovementItem[] = []): bigint {
  return movements.reduce((acc, sm) => {
    const isReturn = sm.type === 'RETURN';
    const multiplier = isReturn ? -1n : 1n;
    const qtyBigInt = BigInt(Math.round(Number(sm.qty)));
    const lineCost = qtyBigInt * sm.unitCostPaise;
    return acc + (multiplier * lineCost);
  }, 0n);
}

/**
 * Calculates labour cost from technician time logs.
 * Cost = (logged hours) * hourly_cost_paise.
 */
export function calculateLabourCostPaise(timeLogs: TimeLogItem[] = []): bigint {
  return timeLogs.reduce((acc, log) => {
    if (!log.endedAt) return acc;
    const startMs = new Date(log.startedAt).getTime();
    const endMs = new Date(log.endedAt).getTime();
    const durationSeconds = Math.max(0, (endMs - startMs) / 1000);
    const durationHours = durationSeconds / 3600;

    // Fractional hour multiplication in paise: (durationSeconds * hourlyCostPaise) / 3600
    const logCost = (BigInt(Math.round(durationSeconds)) * log.hourlyCostPaise) / 3600n;
    return acc + logCost;
  }, 0n);
}

/**
 * Calculates project expenses sum.
 */
export function calculateExpensesCostPaise(expenses: ExpenseItem[] = []): bigint {
  return expenses.reduce((acc, exp) => acc + exp.amountPaise, 0n);
}

/**
 * Computes complete project profitability row matching v_project_profitability.
 */
export function calculateProjectProfitability(input: OrderProfitabilityInput): ProjectProfitabilityResult {
  const netRevenuePaise = input.subtotalPaise - input.discountPaise;
  const materialsPaise = calculateMaterialsCostPaise(input.stockMovements);
  const labourPaise = calculateLabourCostPaise(input.timeLogs);
  const expensesPaise = calculateExpensesCostPaise(input.expenses);

  const installProfitPaise = netRevenuePaise - materialsPaise - labourPaise - expensesPaise;

  let marginBp = 0;
  if (netRevenuePaise > 0n) {
    marginBp = Number((installProfitPaise * 10000n) / netRevenuePaise);
  }

  const marginPercent = netRevenuePaise > 0n
    ? (Number(marginBp) / 100).toFixed(1) + '%'
    : '0.0%';

  return {
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    customerId: input.customerId,
    customerName: input.customerName,
    status: input.status,
    netRevenuePaise,
    materialsPaise,
    labourPaise,
    expensesPaise,
    installProfitPaise,
    marginBp,
    marginPercent,
    isLoss: installProfitPaise < 0n,
  };
}

