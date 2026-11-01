// Dispatch service (C6, C7, FR-5.4-5.6, Demo steps 6-7): scan-to-dispatch with
// clear rejections (WRONG_PRODUCT, ALREADY_SCANNED, UNIT_NOT_AVAILABLE),
// departure locked until every line is complete (service check + trigger),
// delivery that links units to the customer and starts warranties per basis.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit, enqueue } from '@/lib/outbox'
import { computeEndDate } from '@/domain/warranty'
import { istToday } from '@/lib/dates'
import { withIdempotency } from '@/lib/idempotency'
import { parseScannedCode } from '@/lib/qr'

export async function dispatchQueue(status?: string) {
  return db.dispatch.findMany({
    where: status ? { status } : { status: { in: ['PICKING', 'READY', 'IN_TRANSIT'] } },
    include: {
      order: { include: { customer: true } },
      lines: { include: { product: true, units: { where: { removedAt: null }, include: { unit: { include: { product: true } } } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function dispatchDetail(dispatchId: string) {
  const dispatch = await db.dispatch.findUnique({
    where: { id: dispatchId },
    include: {
      order: { include: { customer: true, installation: true } },
      lines: {
        include: {
          product: true,
          orderLine: true,
          units: { where: { removedAt: null }, include: { unit: { include: { product: true } } } },
        },
      },
    },
  })
  if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found.')
  return dispatch
}

export async function scanUnit(dispatchId: string, code: string, method: 'QR' | 'BARCODE' | 'MANUAL', actorId: string, idempotencyKey?: string) {
  // D16: a retried scan with the same key replays the original result —
  // weak networks on the warehouse floor must never double-load a serial.
  if (!idempotencyKey) return scanUnitOnce(dispatchId, code, method, actorId)
  return withIdempotency('dispatch.scan', `${dispatchId}:${idempotencyKey}`, async () => scanUnitOnce(dispatchId, code, method, actorId))
}

async function scanUnitOnce(dispatchId: string, code: string, method: 'QR' | 'BARCODE' | 'MANUAL', actorId: string) {
  const dispatch = await db.dispatch.findUnique({ where: { id: dispatchId }, include: { lines: true, order: true } })
  if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found.')
  if (dispatch.status !== 'PICKING') throw new AppError('INVALID_TRANSITION', 'This dispatch is past picking.')
  if (dispatch.order.status === 'CANCELLED') throw new AppError('INVALID_TRANSITION', 'This order was cancelled.')

  // accept the bare code/serial, the label's full URL, or a /w/ path — a
  // keyboard-wedge scanner types whatever the printed QR contains
  const trimmed = parseScannedCode(code)
  const unit = await db.inventoryUnit.findFirst({
    where: { OR: [{ qrCode: trimmed }, { serialNumber: trimmed }] },
    include: { product: true },
  })
  if (!unit) {
    throw new AppError('UNIT_NOT_AVAILABLE', `No unit found for "${trimmed}". Check the label or enter the serial manually.`)
  }

  const line = dispatch.lines.find((l) => l.productId === unit.productId)
  if (!line) {
    throw new AppError('WRONG_PRODUCT', `This is ${unit.product.name}; it is not on this pick list.`)
  }
  const loadedUnits = await db.dispatchUnit.count({ where: { dispatchLineId: line.id, removedAt: null } })
  if (loadedUnits >= line.qtyRequired) {
    throw new AppError('UNIT_NOT_AVAILABLE', `All ${line.qtyRequired} units of ${unit.product.name} are already scanned.`)
  }
  const already = await db.dispatchUnit.findFirst({ where: { unitId: unit.id, removedAt: null, dispatchId: { not: dispatchId } } })
  const onThis = await db.dispatchUnit.findFirst({ where: { unitId: unit.id, removedAt: null, dispatchId } })
  if (onThis) {
    throw new AppError('ALREADY_SCANNED', `Serial ${unit.serialNumber} is already scanned on this dispatch.`)
  }
  if (already) {
    throw new AppError('ALREADY_SCANNED', `Serial ${unit.serialNumber} is already scanned on another dispatch.`)
  }
  if (unit.status !== 'IN_STOCK') {
    throw new AppError('UNIT_NOT_AVAILABLE', `Serial ${unit.serialNumber} is ${unit.status.replace('_', ' ').toLowerCase()} and cannot be dispatched.`)
  }
  const wh = await db.stockLocation.findUnique({ where: { code: 'WH1' } })
  if (unit.locationId !== wh?.id) {
    throw new AppError('UNIT_NOT_AVAILABLE', `Serial ${unit.serialNumber} is not in the warehouse right now.`)
  }

  // a unit that was unscanned earlier still has its (soft-deleted) row — the
  // (dispatchId, unitId) unique key means it must be reactivated in place,
  // never re-inserted, or every re-scan after an unscan would blow up
  const priorRow = await db.dispatchUnit.findUnique({ where: { dispatchId_unitId: { dispatchId, unitId: unit.id } } })

  await db.$transaction(async (tx) => {
    // bind the unit to the dispatch and flip it to PICKED atomically (D1/D3)
    if (priorRow) {
      await tx.dispatchUnit.update({
        where: { id: priorRow.id },
        data: { removedAt: null, dispatchLineId: line.id, method, scannedBy: actorId, scannedAt: new Date() },
      })
    } else {
      await tx.dispatchUnit.create({
        data: { dispatchId, dispatchLineId: line.id, unitId: unit.id, method, scannedBy: actorId },
      })
    }
    await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'PICKED' } })
    // compare-and-swap the loaded count so two concurrent scans cannot overshoot
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await tx.dispatchLine.updateMany({
        where: { id: line.id, qtyLoaded: loadedUnits },
        data: { qtyLoaded: loadedUnits + 1 },
      })
      if (res.count === 1) break
      const freshLine = await tx.dispatchLine.findUnique({ where: { id: line.id } })
      if (freshLine && freshLine.qtyLoaded >= freshLine.qtyRequired) {
        throw new AppError('UNIT_NOT_AVAILABLE', `All ${line.qtyRequired} units of ${unit.product.name} are already scanned.`)
      }
      if (attempt === 3) throw new AppError('CONFLICT', 'Pick list changed while scanning. Please retry.')
    }
  })

  const refreshed = await db.dispatch.findUnique({ where: { id: dispatchId }, include: { lines: true } })
  const complete = refreshed!.lines.every((l) => l.qtyLoaded >= l.qtyRequired)
  if (complete && refreshed!.status === 'PICKING') {
    await db.dispatch.update({ where: { id: dispatchId }, data: { status: 'READY' } })
  }

  return {
    unit: { id: unit.id, serialNumber: unit.serialNumber, product: unit.product.name, qrCode: unit.qrCode },
    line: { id: line.id, loaded: loadedUnits + 1, required: line.qtyRequired },
    dispatch: { complete, remainingLines: refreshed!.lines.filter((l) => l.qtyLoaded < l.qtyRequired).length },
  }
}

export async function unscanUnit(dispatchId: string, unitId: string, actorId: string) {
  const dispatch = await db.dispatch.findUnique({ where: { id: dispatchId } })
  if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found.')
  if (dispatch.status !== 'PICKING') throw new AppError('INVALID_TRANSITION', 'Units can only be unscanned while picking.')
  const du = await db.dispatchUnit.findFirst({ where: { dispatchId, unitId, removedAt: null } })
  if (!du) throw new AppError('NOT_FOUND', 'That unit is not on this dispatch.')
  await db.dispatchUnit.update({ where: { id: du.id }, data: { removedAt: new Date() } })
  await db.inventoryUnit.update({ where: { id: unitId }, data: { status: 'IN_STOCK' } })
  const line = await db.dispatchLine.findUnique({ where: { id: du.dispatchLineId } })
  await db.dispatchLine.update({ where: { id: du.dispatchLineId }, data: { qtyLoaded: Math.max(0, (line?.qtyLoaded ?? 1) - 1) } })
  return { ok: true }
}

export async function loadQuantity(dispatchId: string, lineId: string, qty: number, actorId: string) {
  const dispatch = await db.dispatch.findUnique({ where: { id: dispatchId } })
  if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found.')
  if (dispatch.status !== 'PICKING') throw new AppError('INVALID_TRANSITION', 'Quantities can only be confirmed while picking.')
  const line = await db.dispatchLine.findUnique({ where: { id: lineId } })
  if (!line || line.dispatchId !== dispatchId) throw new AppError('NOT_FOUND', 'Line not found on this dispatch.')
  const product = await db.product.findUnique({ where: { id: line.productId } })
  if (product?.isSerialized) throw new AppError('VALIDATION_FAILED', 'Serialized items must be scanned one by one.')
  if (qty > line.qtyRequired) throw new AppError('VALIDATION_FAILED', `Only ${line.qtyRequired} needed.`)
  await db.dispatchLine.update({ where: { id: lineId }, data: { qtyLoaded: qty } })
  const refreshed = await db.dispatch.findUnique({ where: { id: dispatchId }, include: { lines: true } })
  const complete = refreshed!.lines.every((l) => l.qtyLoaded >= l.qtyRequired)
  if (complete && refreshed!.status === 'PICKING') {
    await db.dispatch.update({ where: { id: dispatchId }, data: { status: 'READY' } })
  }
  return { ok: true, complete }
}

export async function depart(dispatchId: string, actorId: string) {
  const dispatch = await db.dispatch.findUnique({
    where: { id: dispatchId },
    include: { order: { include: { customer: true } }, lines: { include: { units: { where: { removedAt: null } } } } },
  })
  if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found.')
  if (dispatch.status !== 'READY') throw new AppError('DISPATCH_INCOMPLETE', 'Every line must be complete before departure.')
  // a cancelled order must never leave the warehouse, and must never flip the
  // order back to DISPATCHED (state-machine guard on top of D1)
  if (dispatch.order.status === 'CANCELLED') {
    throw new AppError('INVALID_TRANSITION', `Order ${dispatch.order.orderNumber} was cancelled — this dispatch cannot depart.`)
  }

  const wh = dispatch.fromLocationId
  const veh = dispatch.vehicleLocationId

  // stock movements, balance updates, allocation consumption and the status
  // flips run as ONE transaction (D1/D3): a failure rolls everything back
  await db.$transaction(async (tx) => {
    for (const line of dispatch.lines) {
      const product = await tx.product.findUnique({ where: { id: line.productId } })
      if (product?.isSerialized) {
        for (const du of line.units) {
          const unitRow = await tx.inventoryUnit.findUnique({ where: { id: du.unitId } })
          await tx.inventoryUnit.update({ where: { id: du.unitId }, data: { status: 'DISPATCHED', locationId: veh } })
          await tx.stockMovement.create({
            data: {
              productId: line.productId, unitId: du.unitId, qty: 1, fromLocationId: wh, toLocationId: veh,
              type: 'DISPATCH', unitCostPaise: unitRow?.unitCostPaise ?? 0, refType: 'dispatch', refId: dispatch.id, createdBy: actorId,
            },
          })
        }
        const loaded = line.units.length
        // on-hand reduced at departure (D3) with a compare-and-swap guard
        await casAdjustStock(tx, line.productId, wh, -loaded, -loaded)
        await consumeAllocations(tx, line.orderLineId, loaded)
      } else if (line.qtyLoaded > 0) {
        const level = await tx.stockLevel.findUnique({ where: { productId_locationId: { productId: line.productId, locationId: wh } } })
        const avg = level?.avgCostPaise ?? 0
        await tx.stockMovement.create({
          data: {
            productId: line.productId, qty: line.qtyLoaded, fromLocationId: wh, toLocationId: veh,
            type: 'DISPATCH', unitCostPaise: avg, refType: 'dispatch', refId: dispatch.id, createdBy: actorId,
          },
        })
        await casAdjustStock(tx, line.productId, wh, -line.qtyLoaded, -line.qtyLoaded)
        await consumeAllocations(tx, line.orderLineId, line.qtyLoaded)
      }
    }
    await tx.dispatch.update({ where: { id: dispatchId }, data: { status: 'IN_TRANSIT', departedAt: new Date(), packedBy: actorId } })
    await tx.order.update({ where: { id: dispatch.orderId }, data: { status: 'DISPATCHED' } })
    await enqueue({
      channel: 'SMS',
      recipient: dispatch.order.customer.phone.slice(0, 6) + 'XXXX' + dispatch.order.customer.phone.slice(-3),
      template: 'DISPATCHED',
      payload: { to: dispatch.order.customer.phone, name: dispatch.order.customer.name, dispatchNumber: dispatch.dispatchNumber },
    }, tx)
    await audit({ actorType: 'USER', actorId, entityType: 'dispatch', entityId: dispatchId, action: 'depart' }, tx)
  })
  return { ok: true }
}

/** compare-and-swap stock balance update — concurrent dispatches cannot overdraw */
async function casAdjustStock(
  tx: import('@/lib/outbox').DbClient,
  productId: string,
  locationId: string,
  deltaOnHand: number,
  deltaReserved: number
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const level = await tx.stockLevel.findUnique({ where: { productId_locationId: { productId, locationId } } })
    if (!level) return
    const res = await tx.stockLevel.updateMany({
      where: { productId, locationId, onHand: level.onHand, reserved: level.reserved },
      data: {
        onHand: Math.max(0, level.onHand + deltaOnHand),
        reserved: Math.max(0, level.reserved + deltaReserved),
      },
    })
    if (res.count === 1) return
  }
  throw new AppError('CONFLICT', 'Stock levels changed while dispatching. Please retry.')
}

async function consumeAllocations(tx: import('@/lib/outbox').DbClient, orderLineId: string, qty: number) {
  let remaining = qty
  const allocs = await tx.stockAllocation.findMany({ where: { orderLineId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
  for (const a of allocs) {
    if (remaining <= 0) break
    const take = Math.min(a.qty, remaining)
    remaining -= take
    if (take >= a.qty) {
      await tx.stockAllocation.update({ where: { id: a.id }, data: { status: 'CONSUMED', closedAt: new Date() } })
    } else {
      await tx.stockAllocation.update({ where: { id: a.id }, data: { qty: a.qty - take } })
    }
  }
  const line = await tx.orderLine.findUnique({ where: { id: orderLineId } })
  if (line) {
    await tx.orderLine.update({ where: { id: orderLineId }, data: { qtyDispatched: Math.min(line.qty, (line.qtyDispatched ?? 0) + qty) } })
  }
}

export async function deliver(dispatchId: string, actorId: string, coords?: { lat: number; lng: number }) {
  const dispatch = await db.dispatch.findUnique({
    where: { id: dispatchId },
    include: { order: { include: { customer: true, installation: true } }, lines: { include: { units: { where: { removedAt: null }, include: { unit: { include: { product: true } } } } } } },
  })
  if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found.')
  if (dispatch.status !== 'IN_TRANSIT') throw new AppError('INVALID_TRANSITION', 'Only an in-transit dispatch can be delivered.')

  const sites = await db.stockLocation.findUnique({ where: { code: 'SITES' } })
  const today = istToday()
  const veh = dispatch.vehicleLocationId
  const createdWarranties: { product: string; serial: string; endDate: string; months: number }[] = []

  // units move to the customer site, delivery-basis warranties start and the
  // status flips all land in ONE transaction (D1): no half-delivered state
  await db.$transaction(async (tx) => {
    for (const line of dispatch.lines) {
      for (const du of line.units) {
        const unit = du.unit
        await tx.inventoryUnit.update({
          where: { id: unit.id },
          data: {
            status: 'DELIVERED', locationId: sites!.id, customerId: dispatch.order.customerId,
            orderId: dispatch.orderId, installationId: dispatch.order.installation!.id, deliveredOn: today,
          },
        })
        await tx.stockMovement.create({
          data: { productId: unit.productId, unitId: unit.id, qty: 1, fromLocationId: veh, toLocationId: sites!.id, type: 'DELIVERY', unitCostPaise: unit.unitCostPaise, refType: 'dispatch', refId: dispatch.id, createdBy: actorId },
        })
        // warranty starts at delivery for basis DELIVERY (A6, C7)
        if (unit.product.warrantyStartBasis === 'DELIVERY' && dispatch.order.installation) {
          const end = computeEndDate(today, unit.product.warrantyMonths)
          await tx.warranty.create({
            data: {
              unitId: unit.id, installationId: dispatch.order.installation!.id, customerId: dispatch.order.customerId,
              productId: unit.productId, coverage: 'EQUIPMENT', startDate: today, endDate: end,
              months: unit.product.warrantyMonths, status: 'ACTIVE', source: 'DELIVERY',
            },
          })
          createdWarranties.push({ product: unit.product.name, serial: unit.serialNumber, endDate: end, months: unit.product.warrantyMonths })
        }
      }
      // non-serialized: move remaining vehicle stock to the customer sites pool
      const nonSerialLoaded = line.qtyLoaded - line.units.length
      if (nonSerialLoaded > 0) {
        const level = await tx.stockLevel.findUnique({ where: { productId_locationId: { productId: line.productId, locationId: veh } } })
        const avg = level?.avgCostPaise ?? 0
        await tx.stockMovement.create({
          data: { productId: line.productId, qty: nonSerialLoaded, fromLocationId: veh, toLocationId: sites!.id, type: 'DELIVERY', unitCostPaise: avg, refType: 'dispatch', refId: dispatch.id, createdBy: actorId },
        })
      }
    }

    await tx.dispatch.update({
      where: { id: dispatchId },
      data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredLat: coords?.lat ?? null, deliveredLng: coords?.lng ?? null },
    })
    await tx.order.update({ where: { id: dispatch.orderId }, data: { status: 'DELIVERED' } })
    await audit({ actorType: 'USER', actorId, entityType: 'dispatch', entityId: dispatchId, action: 'deliver', after: { warranties: createdWarranties.length } }, tx)
  })
  // FR-10.5: warranties activated at delivery — the customer's portal now carries
  // their printable warranty certificates; send the link through the outbox.
  if (createdWarranties.length > 0) {
    const { issueLink } = await import('@/lib/access-links')
    const { token: portalToken } = await issueLink(dispatch.order.customerId, 'PORTAL', actorId, 90)
    await enqueue({
      channel: 'SMS',
      recipient: dispatch.order.customer.phone.slice(0, 6) + 'XXXX' + dispatch.order.customer.phone.slice(-3),
      template: 'WARRANTY_ACTIVATED',
      payload: { to: dispatch.order.customer.phone, name: dispatch.order.customer.name, count: createdWarranties.length, link: `/p/${portalToken}` },
    })
  }
  await enqueue({
    channel: 'SMS',
    recipient: dispatch.order.customer.phone.slice(0, 6) + 'XXXX' + dispatch.order.customer.phone.slice(-3),
    template: 'DELIVERED',
    payload: { to: dispatch.order.customer.phone, name: dispatch.order.customer.name, warranties: createdWarranties.length },
  })
  await audit({ actorType: 'USER', actorId, entityType: 'dispatch', entityId: dispatchId, action: 'deliver', after: { warranties: createdWarranties.length } })
  return { ok: true, warranties: createdWarranties }
}
