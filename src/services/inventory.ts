// Inventory service (C6, FR-5.x): catalogue, stock receipt with serial capture
// and QR labels, append-only movement ledger + balance table (D2), weighted
// average cost, audited adjustments, suppliers and purchase orders (FR-5.8).

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { nextNumber } from '@/lib/ids'
import { audit, enqueue } from '@/lib/outbox'
import { getSettings } from '@/lib/settings'
import { warrantyUrl, qrDataUrl, parseScannedCode } from '@/lib/qr'
import { istToday } from '@/lib/dates'
import { reallocateOrderShortages } from '@/services/orders'
import { randomBytes } from 'crypto'

const WH = 'WH1'

export function makeQrCode(): string {
  return 'SP' + randomBytes(4).toString('hex').toUpperCase()
}

export async function stockOverview(filter?: { lowOnly?: boolean }) {
  const settings = await getSettings()
  const products = await db.product.findMany({
    where: { isActive: true },
    include: { stockLevels: { include: { location: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
  // one row per product AND location (FR-5.3): a product stocked in several
  // places shows one line each; unstocked products keep a single zero row.
  const rows = products.flatMap((p) => {
    const levels = p.stockLevels.length > 0
      ? p.stockLevels
      : [{ productId: p.id, locationId: null as string | null, location: null as { name: string } | null, onHand: 0, reserved: 0, avgCostPaise: 0 }]
    return levels.map((level) => {
      const onHand = level.onHand
      const reserved = level.reserved
      const available = onHand - reserved
      return {
        id: p.id, sku: p.sku, name: p.name, category: p.category, uom: p.uom,
        isSerialized: p.isSerialized, reorderLevel: p.reorderLevel,
        locationId: level.locationId,
        locationName: level.location?.name ?? null,
        onHand, reserved, available,
        low: available < p.reorderLevel,
        avgCostPaise: level.avgCostPaise,
        salePricePaise: p.salePricePaise, warrantyMonths: p.warrantyMonths,
        warrantyStartBasis: p.warrantyStartBasis, taxRateBp: p.taxRateBp, stdCostPaise: p.stdCostPaise,
        _threshold: settings,
      }
    })
  })
  return filter?.lowOnly ? rows.filter((r) => r.low) : rows
}

export async function receiveStock(input: {
  supplierName: string
  supplierId?: string | null
  poId?: string | null
  supplierInvoiceRef?: string
  receivedOn?: string
  lines: { productId: string; qty: number; unitCostPaise: number; serialNumbers?: string[] }[]
  origin?: string
  actorId: string
}) {
  const wh = await db.stockLocation.findUnique({ where: { code: WH } })
  if (!wh) throw new AppError('INTERNAL', 'Warehouse location missing.')
  const receiptNumber = await nextNumber('GRN', 'GRN')
  const totalPaise = input.lines.reduce((s, l) => s + l.qty * l.unitCostPaise, 0)

  const receipt = await db.purchaseReceipt.create({
    data: {
      receiptNumber, supplierName: input.supplierName, supplierId: input.supplierId ?? null,
      poId: input.poId ?? null, supplierInvoiceRef: input.supplierInvoiceRef ?? null,
      receivedOn: input.receivedOn ?? istToday(),
      locationId: wh.id, totalPaise,
    },
  })

  const labels: { serial: string; qr: string; product: string; qrDataUrl: string }[] = []

  for (const line of input.lines) {
    const product = await db.product.findUnique({ where: { id: line.productId } })
    if (!product) throw new AppError('NOT_FOUND', 'Product not found on a receipt line.')
    if (product.isSerialized && (!line.serialNumbers || line.serialNumbers.length !== line.qty)) {
      throw new AppError('VALIDATION_FAILED', `${product.name}: enter exactly ${line.qty} serial numbers (serialized item).`)
    }
    const receiptLine = await db.purchaseReceiptLine.create({
      data: {
        receiptId: receipt.id, productId: line.productId, qty: line.qty,
        unitCostPaise: line.unitCostPaise,
        poLineId: await matchingPoLine(input.poId ?? null, line.productId),
      },
    })

    // units for serialized items (C6)
    if (product.isSerialized && line.serialNumbers) {
      for (const serial of line.serialNumbers) {
        // normalize scanned text: a wedge scanner types the label's full URL,
        // but only the serial itself may be stored on the unit
        const trimmed = parseScannedCode(serial)
        if (!trimmed) continue
        const existing = await db.inventoryUnit.findUnique({ where: { productId_serialNumber: { productId: product.id, serialNumber: trimmed } } })
        if (existing) throw new AppError('CONFLICT', `Serial ${trimmed} already exists in the system.`)
        const qr = makeQrCode()
        await db.inventoryUnit.create({
          data: {
            productId: product.id, serialNumber: trimmed, qrCode: qr, status: 'IN_STOCK',
            locationId: wh.id, unitCostPaise: line.unitCostPaise, receiptLineId: receiptLine.id,
          },
        })
        // QR opens the public warranty page — absolute so printed labels scan
        // from any phone (FR-5.2/FR-5.9)
        labels.push({ serial: trimmed, qr, product: product.name, qrDataUrl: await qrDataUrl(warrantyUrl(input.origin, qr)) })
      }
    }

    // ledger + balance (D2)
    await db.stockMovement.create({
      data: {
        productId: product.id, qty: line.qty, toLocationId: wh.id, type: 'RECEIPT',
        unitCostPaise: line.unitCostPaise, refType: 'purchase_receipt', refId: receipt.id,
        createdBy: input.actorId,
      },
    })
    const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: product.id, locationId: wh.id } } })
    const onHand = level?.onHand ?? 0
    const avg = level?.avgCostPaise ?? 0
    const newAvg = onHand + line.qty > 0 ? Math.round((onHand * avg + line.qty * line.unitCostPaise) / (onHand + line.qty)) : line.unitCostPaise
    await db.stockLevel.upsert({
      where: { productId_locationId: { productId: product.id, locationId: wh.id } },
      create: { productId: product.id, locationId: wh.id, onHand: line.qty, reserved: 0, avgCostPaise: newAvg },
      update: { onHand: onHand + line.qty, avgCostPaise: newAvg },
    })
  }

  // update PO line received quantities and status (FR-5.8)
  if (input.poId) {
    const po = await db.purchaseOrder.findUnique({ where: { id: input.poId }, include: { lines: true } })
    if (po) {
      for (const poLine of po.lines) {
        const received = await db.purchaseReceiptLine.aggregate({ where: { poLineId: poLine.id }, _sum: { qty: true } })
        await db.purchaseOrderLine.update({ where: { id: poLine.id }, data: { qtyReceived: received._sum.qty ?? 0 } })
      }
      const all = await db.purchaseOrderLine.findMany({ where: { poId: po.id } })
      const status = all.every((l) => l.qtyReceived >= l.qtyOrdered) ? 'RECEIVED' : all.some((l) => l.qtyReceived > 0) ? 'PARTIAL' : 'OPEN'
      await db.purchaseOrder.update({ where: { id: po.id }, data: { status } })
    }
  }

  // low-stock alerts compare reorder level with Available (FR-5.3)
  await checkLowStock()

  // FR-4.5: the freshly received stock automatically covers shortages on
  // confirmed orders that were waiting for these products.
  await coverShortagesFor([...new Set(input.lines.map((l) => l.productId))], input.actorId)

  await audit({ actorType: 'USER', actorId: input.actorId, entityType: 'purchase_receipt', entityId: receipt.id, action: 'receive', after: { receiptNumber, lines: input.lines.length } })
  return { receipt, labels }
}

// Confirmed orders with a line short on one of the received products get their
// active allocations extended up to what is now available (source of truth for
// the dispatch gate is orderLine.qtyReserved, updated by the reallocation).
async function coverShortagesFor(productIds: string[], actorId: string) {
  if (productIds.length === 0) return
  const lines = await db.orderLine.findMany({
    where: { productId: { in: productIds }, order: { status: 'CONFIRMED' } },
    select: { orderId: true, qty: true, qtyReserved: true },
  })
  const shortOrderIds = [...new Set(lines.filter((l) => l.qtyReserved < l.qty).map((l) => l.orderId))]
  for (const orderId of shortOrderIds) {
    await reallocateOrderShortages(orderId, actorId)
  }
}

async function matchingPoLine(poId: string | null, productId: string): Promise<string | null> {
  if (!poId) return null
  const line = await db.purchaseOrderLine.findFirst({ where: { poId, productId } })
  return line?.id ?? null
}

export async function checkLowStock() {
  const rows = await stockOverview({ lowOnly: true })
  if (rows.length > 0) {
    const payload = { items: rows.map((r) => ({ name: r.name, available: r.available, reorder: r.reorderLevel })) }
    const messages: Parameters<typeof enqueue>[0] = [
      { channel: 'EMAIL', recipient: 'director@sunpower.example', template: 'LOW_STOCK', payload },
    ]
    // the warehouse is notified alongside the director (FR-5.3)
    const warehouseUsers = await db.user.findMany({ where: { role: 'WAREHOUSE', isActive: true }, select: { email: true } })
    const recipients = warehouseUsers.map((u) => u.email)
    if (recipients.length === 0) recipients.push('warehouse@sunpower.example')
    for (const recipient of recipients) {
      messages.push({ channel: 'EMAIL', recipient, template: 'LOW_STOCK', payload })
    }
    await enqueue(messages)
  }
  return rows
}

export async function adjustStock(input: { productId: string; deltaQty: number; reason: string; actorId: string }) {
  if (!input.reason) throw new AppError('VALIDATION_FAILED', 'A reason is required for a stock adjustment.')
  const wh = await db.stockLocation.findUnique({ where: { code: WH } })
  const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: input.productId, locationId: wh!.id } } })
  const onHand = level?.onHand ?? 0
  const newOnHand = onHand + input.deltaQty
  if (newOnHand < 0) throw new AppError('INSUFFICIENT_STOCK', 'Adjustment would take stock below zero.')
  if (newOnHand < (level?.reserved ?? 0)) throw new AppError('INSUFFICIENT_STOCK', 'Adjustment would break existing reservations.')
  await db.stockMovement.create({
    data: {
      productId: input.productId, qty: Math.abs(input.deltaQty),
      fromLocationId: input.deltaQty < 0 ? wh!.id : null,
      toLocationId: input.deltaQty > 0 ? wh!.id : null,
      type: input.deltaQty > 0 ? 'ADJUST_IN' : 'ADJUST_OUT',
      unitCostPaise: level?.avgCostPaise ?? 0, refType: 'adjustment',
      refId: 'manual', reason: input.reason, createdBy: input.actorId,
    },
  })
  await db.stockLevel.update({ where: { productId_locationId: { productId: input.productId, locationId: wh!.id } }, data: { onHand: newOnHand } })
  await audit({ actorType: 'USER', actorId: input.actorId, entityType: 'stock', entityId: input.productId, action: 'adjust', before: { onHand }, after: { onHand: newOnHand }, })
  return { ok: true, onHand: newOnHand }
}

// FR-5.7: goods coming back to the warehouse (site leftover, RMA in, wrong
// item handed back) are recorded as an audited RETURN movement that raises
// on-hand stock.
export async function recordReturn(input: {
  productId: string
  unitId?: string | null
  qty: number
  reason: string
  orderId?: string | null
  actorId: string
}) {
  const trimmedReason = input.reason?.trim() ?? ''
  if (trimmedReason.length < 3) throw new AppError('VALIDATION_FAILED', 'A reason of at least 3 characters is required for a return.')
  if (!(input.qty > 0)) throw new AppError('VALIDATION_FAILED', 'Return quantity must be above zero.')
  const wh = await db.stockLocation.findUnique({ where: { code: WH } })
  if (!wh) throw new AppError('INTERNAL', 'Warehouse location missing.')
  const product = await db.product.findUnique({ where: { id: input.productId } })
  if (!product) throw new AppError('NOT_FOUND', 'Product not found.')

  let unitCostPaise = 0
  if (input.unitId) {
    const unit = await db.inventoryUnit.findUnique({ where: { id: input.unitId } })
    if (!unit || unit.productId !== input.productId) throw new AppError('VALIDATION_FAILED', 'That unit does not belong to this product.')
    if (input.qty !== 1) throw new AppError('VALIDATION_FAILED', 'A serialized unit is returned one at a time (qty 1).')
    unitCostPaise = unit.unitCostPaise
    // the unit is physically back on the warehouse shelf
    await db.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'IN_STOCK', locationId: wh.id } })
  } else {
    const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: input.productId, locationId: wh.id } } })
    unitCostPaise = level?.avgCostPaise ?? product.stdCostPaise
  }

  const movement = await db.stockMovement.create({
    data: {
      productId: input.productId, unitId: input.unitId ?? null, qty: input.qty,
      toLocationId: wh.id, type: 'RETURN', unitCostPaise,
      refType: 'return', refId: input.orderId ?? 'manual', reason: trimmedReason,
      createdBy: input.actorId,
    },
  })
  const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: input.productId, locationId: wh.id } } })
  const onHand = (level?.onHand ?? 0) + input.qty
  await db.stockLevel.upsert({
    where: { productId_locationId: { productId: input.productId, locationId: wh.id } },
    create: { productId: input.productId, locationId: wh.id, onHand: input.qty, reserved: 0, avgCostPaise: unitCostPaise },
    update: { onHand },
  })
  await audit({
    actorType: 'USER', actorId: input.actorId, entityType: 'stock', entityId: input.productId,
    action: 'return',
    before: { onHand: level?.onHand ?? 0 },
    after: { onHand, qty: input.qty, reason: trimmedReason, unitId: input.unitId ?? null, orderId: input.orderId ?? null },
  })
  return { ok: true, movementId: movement.id, onHand }
}

export async function lookupUnit(code: string) {
  const trimmed = parseScannedCode(code)
  const unit = await db.inventoryUnit.findFirst({
    where: { OR: [{ qrCode: trimmed }, { serialNumber: { contains: trimmed } }] },
    include: { product: true, customer: true, order: true, warranties: true },
  })
  if (!unit) return null
  return unit
}

export async function listUnits(filter?: { status?: string; q?: string }) {
  const where: Record<string, unknown> = {}
  if (filter?.status) where.status = filter.status
  if (filter?.q) where.OR = [{ serialNumber: { contains: filter.q } }, { qrCode: { contains: filter.q } }, { product: { name: { contains: filter.q } } }]
  return db.inventoryUnit.findMany({
    where,
    include: { product: true, customer: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

// ── Suppliers & POs (FR-5.8) ─────────────────────────────────

export async function listSuppliers() {
  return db.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
}

export async function createSupplier(input: { name: string; contact?: string; phone?: string; email?: string; gstin?: string }) {
  const existing = await db.supplier.findUnique({ where: { name: input.name } })
  if (existing) throw new AppError('CONFLICT', 'A supplier with this name already exists.')
  return db.supplier.create({ data: input })
}

export async function listPurchaseOrders() {
  return db.purchaseOrder.findMany({
    include: { supplier: true, lines: { include: { product: true } }, receipts: true },
    orderBy: { createdAt: 'desc' },
  })
}

// FR-5.8: an open or partially received PO can be cancelled with a reason;
// received/cancelled POs are final.
export async function cancelPurchaseOrder(poId: string, reason: string, actorId: string) {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 3) throw new AppError('VALIDATION_FAILED', 'A reason of at least 3 characters is required to cancel a purchase order.')
  const po = await db.purchaseOrder.findUnique({ where: { id: poId } })
  if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found.')
  if (!['OPEN', 'PARTIAL'].includes(po.status)) {
    throw new AppError('INVALID_TRANSITION', `A ${po.status.toLowerCase()} purchase order cannot be cancelled.`)
  }
  await db.purchaseOrder.update({ where: { id: poId }, data: { status: 'CANCELLED' } })
  await audit({
    actorType: 'USER', actorId, entityType: 'purchase_order', entityId: poId,
    action: 'cancel',
    before: { status: po.status },
    after: { status: 'CANCELLED', reason: trimmed },
  })
  return { ok: true }
}

export async function purchaseOrderDetail(poId: string) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: { supplier: true, lines: { include: { product: true } }, receipts: true },
  })
  if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found.')
  return po
}

export async function createPurchaseOrder(input: {
  supplierId: string; orderedOn?: string; expectedOn?: string
  lines: { productId: string; qty: number; unitCostPaise: number }[]
  actorId: string
}) {
  const poNumber = await nextNumber('PO', 'PO')
  const total = input.lines.reduce((s, l) => s + l.qty * l.unitCostPaise, 0)
  const po = await db.purchaseOrder.create({
    data: {
      poNumber, supplierId: input.supplierId, status: 'OPEN',
      orderedOn: input.orderedOn ?? istToday(),
      expectedOn: input.expectedOn ?? null, totalPaise: total, createdBy: input.actorId,
    },
  })
  await db.purchaseOrderLine.createMany({
    data: input.lines.map((l) => ({ poId: po.id, productId: l.productId, qtyOrdered: l.qty, unitCostPaise: l.unitCostPaise })),
  })
  await audit({ actorType: 'USER', actorId: input.actorId, entityType: 'purchase_order', entityId: po.id, action: 'create', after: { poNumber, total } })
  return db.purchaseOrder.findUnique({ where: { id: po.id }, include: { lines: { include: { product: true } }, supplier: true } })
}
