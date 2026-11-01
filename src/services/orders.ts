// Orders service (C4, C5, FR-4.x): payments with idempotency keys (D16),
// automatic confirmation at the 30% advance threshold, stock reservation with
// row-lock discipline (D3 — compare-and-swap guarded updates inside one
// transaction), pick list + installation job + crew suggestions, cancellation
// that releases reservations, unpicks units, cancels the dispatch and records
// the refund, plus the payment-reversal flow.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { nextNumber, TxLike } from '@/lib/ids'
import { audit, enqueue, DbClient } from '@/lib/outbox'
import { getSettings } from '@/lib/settings'
import { scoreCrews } from '@/domain/crew-scoring'
import { istToday } from '@/lib/dates'

const WH_CODE = 'WH1'
const VEH_CODE = 'VEH1'

async function locationByCode(code: string, tx?: DbClient) {
  const client = tx ?? db
  const loc = await client.stockLocation.findUnique({ where: { code } })
  if (!loc) throw new AppError('INTERNAL', `Stock location ${code} missing.`)
  return loc
}

/** real staff recipients for outbox messages (no hard-coded placeholders) */
async function staffEmail(role: string): Promise<string> {
  const u = await db.user.findFirst({ where: { role, isActive: true }, orderBy: { createdAt: 'asc' } })
  return u?.email ?? `${role.toLowerCase()}@sunpower.example`
}

/**
 * D3 row-lock discipline on SQLite: reserve stock with a compare-and-swap
 * updateMany guarded on the previously read balance, retried a few times so
 * two concurrent confirmations can never overbook the same units.
 */
async function casReserve(tx: DbClient, productId: string, locationId: string, need: number): Promise<number> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const level = await tx.stockLevel.findUnique({ where: { productId_locationId: { productId, locationId } } })
    if (!level) return 0
    const available = level.onHand - level.reserved
    const take = Math.max(0, Math.min(need, available))
    if (take <= 0) return 0
    const res = await tx.stockLevel.updateMany({
      where: { productId, locationId, reserved: level.reserved, onHand: level.onHand },
      data: { reserved: level.reserved + take },
    })
    if (res.count === 1) return take
    // lost the race — re-read and retry
  }
  throw new AppError('CONFLICT', 'Stock levels changed while reserving. Please try again.')
}

/** release reserved stock with the same CAS guard (floor at zero) */
async function casRelease(tx: DbClient, productId: string, locationId: string, qty: number): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const level = await tx.stockLevel.findUnique({ where: { productId_locationId: { productId, locationId } } })
    if (!level) return
    const target = Math.max(0, level.reserved - qty)
    const res = await tx.stockLevel.updateMany({
      where: { productId, locationId, reserved: level.reserved },
      data: { reserved: target },
    })
    if (res.count === 1) return
  }
  throw new AppError('CONFLICT', 'Stock levels changed while releasing. Please try again.')
}

export async function recordPayment(input: {
  orderId: string
  amountPaise: number
  method: string
  kind?: string
  reference?: string
  receivedOn?: string
  idempotencyKey?: string
  actorId: string
}) {
  if (input.amountPaise <= 0) throw new AppError('VALIDATION_FAILED', 'Payment amount must be above zero.')
  if (input.idempotencyKey) {
    const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return { payment: existing, order: existing.orderId ? await db.order.findUnique({ where: { id: existing.orderId } }) : null, replayed: true }
  }
  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { customer: true } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  if (order.status === 'CANCELLED') throw new AppError('INVALID_TRANSITION', 'This order was cancelled.')

  // payment, balance update and (at the threshold) the whole confirmation run
  // as ONE transaction (D1/D3): a failure leaves nothing half-applied.
  const { payment, confirmed } = await db.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: order.id } })
    if (!current) throw new AppError('NOT_FOUND', 'Order not found.')
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        amountPaise: input.amountPaise,
        method: input.method,
        kind: input.kind ?? 'ADVANCE',
        reference: input.reference,
        receivedOn: input.receivedOn ?? istToday(),
        idempotencyKey: input.idempotencyKey ?? null,
        recordedBy: input.actorId,
      },
    })
    const paidPaise = current.paidPaise + input.amountPaise
    const updated = await tx.order.update({ where: { id: order.id }, data: { paidPaise } })
    await audit({ actorType: 'USER', actorId: input.actorId, entityType: 'payment', entityId: payment.id, action: 'record', after: { amountPaise: input.amountPaise, method: input.method } }, tx)

    // auto-confirm when the advance threshold is reached (FR-4.3)
    let confirmed = false
    if (updated.status === 'PENDING_ADVANCE' && paidPaise >= updated.advanceRequiredPaise) {
      await confirmOrderTx(order.id, input.actorId, 'advance threshold reached', tx)
      confirmed = true
    }
    return { payment, confirmed }
  })
  const fresh = await db.order.findUnique({ where: { id: order.id } })
  return { payment, order: fresh, confirmed }
}

/** FR-4.x payment reversal: marks the original REVERSED, records a reversal
 *  row and pulls the order balance back. Used for bounced cheques/refunds. */
export async function reversePayment(paymentId: string, reason: string, actorId: string) {
  const original = await db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { customer: true } }, invoice: { include: { customer: true } } },
  })
  if (!original) throw new AppError('NOT_FOUND', 'Payment not found.')
  if (original.status !== 'RECEIVED') throw new AppError('INVALID_TRANSITION', 'Only a received payment can be reversed.')
  if (!reason || reason.length < 3) throw new AppError('VALIDATION_FAILED', 'A reversal reason is required.')

  const reversal = await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: original.id }, data: { status: 'REVERSED' } })
    const row = await tx.payment.create({
      data: {
        orderId: original.orderId,
        invoiceId: original.invoiceId,
        customerId: original.customerId,
        amountPaise: original.amountPaise,
        method: original.method,
        kind: 'REVERSAL',
        reference: reason.slice(0, 200),
        receivedOn: istToday(),
        status: 'REVERSED',
        reversalOfId: original.id,
        recordedBy: actorId,
      },
    })
    if (original.orderId && original.order) {
      await tx.order.update({
        where: { id: original.orderId },
        data: { paidPaise: Math.max(0, original.order.paidPaise - original.amountPaise) },
      })
    } else if (original.invoiceId) {
      await tx.invoice.update({
        where: { id: original.invoiceId },
        data: { status: 'ISSUED' },
      })
    }
    await audit({
      actorType: 'USER', actorId, entityType: 'payment', entityId: original.id, action: 'reverse',
      before: { status: 'RECEIVED' }, after: { status: 'REVERSED', reason, reversalId: row.id },
    }, tx)
    return row
  })
  const phone = original.order?.customer.phone ?? original.invoice?.customer?.phone
  const name = original.order?.customer.name ?? original.invoice?.customer?.name ?? 'Customer'
  const refNum = original.order?.orderNumber ?? original.invoice?.invoiceNumber ?? 'Payment'
  if (phone) {
    await enqueue({
      channel: 'SMS',
      recipient: phone.slice(0, 6) + 'XXXX' + phone.slice(-3),
      template: 'PAYMENT_REVERSED',
      payload: { to: phone, name, orderNumber: refNum, amount: original.amountPaise, reason },
    })
  }
  return { ok: true, reversalId: reversal.id }
}

export async function confirmOrder(orderId: string, actorId: string, via = 'manual override') {
  return db.$transaction((tx) => confirmOrderTx(orderId, actorId, via, tx))
}

/**
 * The whole confirmation — stock reservation, pick list, installation job,
 * crew suggestions, outbox rows — runs inside the caller's transaction:
 * all or nothing (D1). A failure rolls back to a clean PENDING_ADVANCE order,
 * so a retry starts from scratch instead of a half-built order.
 */
async function confirmOrderTx(orderId: string, actorId: string, via: string, tx: DbClient) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true, customer: true } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  if (order.status !== 'PENDING_ADVANCE') return order

  const wh = await locationByCode(WH_CODE, tx)
  const veh = await locationByCode(VEH_CODE, tx)
  const settings = await getSettings()

  // ── reserve stock (D3): one allocation pass; shortages recorded on the line.
  // Services are not physical stock: they are marked reserved without an allocation.
  const shortages: { product: string; short: number }[] = []
  for (const line of order.lines) {
    const lineProduct = await tx.product.findUnique({ where: { id: line.productId } })
    if (lineProduct?.category === 'SERVICE') {
      await tx.orderLine.update({ where: { id: line.id }, data: { qtyReserved: line.qty } })
      continue
    }
    const remainingNeed = line.qty - line.qtyReserved
    const toReserve = remainingNeed > 0 ? await casReserve(tx, line.productId, wh.id, remainingNeed) : 0
    if (toReserve > 0) {
      await tx.stockAllocation.create({
        data: { orderLineId: line.id, productId: line.productId, locationId: wh.id, qty: toReserve, status: 'ACTIVE' },
      })
      await tx.orderLine.update({ where: { id: line.id }, data: { qtyReserved: line.qtyReserved + toReserve } })
    }
    if (line.qtyReserved + toReserve < line.qty) {
      // shortage recorded on the line; dispatch blocked until covered (FR-4.5)
      shortages.push({ product: line.description, short: line.qty - (line.qtyReserved + toReserve) })
    }
  }

  let dispatch = await tx.dispatch.findFirst({ where: { orderId: order.id } })
  if (!dispatch) {
    const dispatchNumber = await nextNumber('DISPATCH', 'DSP', tx)
    const createdDispatch = await tx.dispatch.create({
      data: {
        dispatchNumber, orderId: order.id, status: 'PICKING',
        fromLocationId: wh.id, vehicleLocationId: veh.id,
        scheduledOn: istToday(),
      },
    })
    dispatch = createdDispatch
    const products = await tx.product.findMany({ where: { id: { in: order.lines.map((l) => l.productId) } } })
    const physicalLines = order.lines.filter((l) => products.find((p) => p.id === l.productId)?.category !== 'SERVICE')
    if (physicalLines.length > 0) {
      await tx.dispatchLine.createMany({
        data: physicalLines.map((l) => ({ dispatchId: createdDispatch.id, orderLineId: l.id, productId: l.productId, qtyRequired: l.qty })),
      })
    }
  }

  // installation job + crew suggestions (Automation 7)
  let suggestions: any[] = []
  let installation = await tx.installation.findUnique({ where: { orderId: order.id } })
  if (!installation) {
    installation = await tx.installation.create({ data: { orderId: order.id, status: 'SCHEDULED' } })
    suggestions = await suggestCrews(installation.id, order, settings, tx)
  }

  await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), overrideBy: via === 'manual override' ? actorId : null } })

  if (shortages.length > 0) {
    const directorEmail = await staffEmail('DIRECTOR')
    await enqueue(shortages.map((s) => ({
      channel: 'EMAIL' as const,
      recipient: directorEmail,
      template: 'STOCK_SHORTAGE',
      payload: { orderNumber: order.orderNumber, product: s.product, short: s.short },
    })), tx)
  }
  const warehouseEmail = await staffEmail('WAREHOUSE')
  await enqueue([
    { channel: 'EMAIL', recipient: warehouseEmail, template: 'ORDER_CONFIRMED_WAREHOUSE', payload: { orderNumber: order.orderNumber, dispatchNumber: dispatch?.dispatchNumber ?? '' } },
    { channel: 'SMS', recipient: order.customer.phone.slice(0, 6) + 'XXXX' + order.customer.phone.slice(-3), template: 'ORDER_CONFIRMED_CUSTOMER', payload: { to: order.customer.phone, name: order.customer.name, orderNumber: order.orderNumber } },
  ], tx)
  await audit({ actorType: 'USER', actorId, entityType: 'order', entityId: order.id, action: 'confirm', before: { status: 'PENDING_ADVANCE' }, after: { status: 'CONFIRMED', via, suggestions: suggestions.length } }, tx)
  return tx.order.findUnique({ where: { id: order.id } })
}

// FR-4.5: shortages can now be covered. A confirmed order that was left short
// gets its ACTIVE StockAllocation rows (re)created/extended up to what is now
// available per product+location; orderLine.qtyReserved — the source of truth
// the dispatch gate and schedule guard read — is raised to match, so dispatch
// scheduling passes once every line is fully covered.
export async function reallocateOrderShortages(orderId: string, actorId: string | null) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: true } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  if (order.status !== 'CONFIRMED') return { ok: false as const, covered: 0 }

  const wh = await locationByCode(WH_CODE)
  const covered = await db.$transaction(async (tx) => {
    let covered = 0
    for (const line of order.lines) {
      const remainingNeed = line.qty - line.qtyReserved
      if (remainingNeed <= 0) continue
      const product = await tx.product.findUnique({ where: { id: line.productId } })
      if (product?.category === 'SERVICE') continue // services are auto-reserved without an allocation
      const toReserve = await casReserve(tx, line.productId, wh.id, remainingNeed)
      if (toReserve <= 0) continue
      await tx.stockAllocation.create({
        data: { orderLineId: line.id, productId: line.productId, locationId: wh.id, qty: toReserve, status: 'ACTIVE' },
      })
      await tx.orderLine.update({ where: { id: line.id }, data: { qtyReserved: line.qtyReserved + toReserve } })
      covered += toReserve
    }
    if (covered > 0) {
      await audit({
        actorType: 'USER', actorId, entityType: 'order', entityId: order.id,
        action: 'shortage_reallocated',
        after: { orderNumber: order.orderNumber, covered, note: 'Received stock allocated to previously short lines' },
      }, tx)
    }
    return covered
  })
  return { ok: true as const, covered }
}

async function suggestCrews(installationId: string, order: { id?: string; systemType: string; capacityKw: number }, settings?: Awaited<ReturnType<typeof getSettings>>, tx?: DbClient) {
  const client = tx ?? db
  const cfg = settings ?? (await getSettings())
  const techs = await client.technician.findMany({
    where: { user: { isActive: true } },
    include: { user: true, leaves: true },
  })
  const today = istToday()
  const [jobsToday, weekLogs, surveys] = await Promise.all([
    client.installationCrew.groupBy({ by: ['technicianId'], where: { installation: { scheduledOn: today, status: { in: ['SCHEDULED', 'IN_PROGRESS', 'AWAITING_SIGNOFF'] } } }, _count: { _all: true } }),
    client.timeLog.findMany({ where: { startedAt: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { technicianId: true, startedAt: true, endedAt: true } }),
    client.siteSurvey.findMany({ where: { lead: { quotes: { some: { order: { id: (order as any).id } } } } }, select: { surveyorId: true } }),
  ])
  const jobsMap = new Map(jobsToday.map((j) => [j.technicianId, j._count._all]))
  const hoursMap = new Map<string, number>()
  for (const tl of weekLogs) {
    const hrs = tl.endedAt ? (tl.endedAt.getTime() - tl.startedAt.getTime()) / 3600000 : 0
    hoursMap.set(tl.technicianId, (hoursMap.get(tl.technicianId) ?? 0) + hrs)
  }
  const surveyedBy = new Set(surveys.map((s) => s.surveyorId))

  const candidates = techs.map((t) => ({
    technicianId: t.id,
    name: t.user.name,
    skills: t.skills.split(',').filter(Boolean),
    isCrewLead: t.isCrewLead,
    onLeave: t.leaves.some((l) => l.startsOn <= today && today <= l.endsOn),
    jobsOnDate: jobsMap.get(t.id) ?? 0,
    weeklyHours: hoursMap.get(t.id) ?? 0,
    distanceKm: 5 + (t.baseLat ? Math.abs(t.baseLat - 23.02) * 111 + Math.abs(t.baseLng - 72.57) * 111 : 10),
    surveyedSite: surveyedBy.has(t.userId),
  }))
  const results = scoreCrews(candidates, { systemType: order.systemType, capacityKw: order.capacityKw, weights: cfg.crewWeights })
  if (results.length > 0) {
    await client.crewSuggestion.createMany({
      data: results.map((r, i) => ({
        installationId, rank: i + 1, technicianIds: r.technicianIds.join(','),
        score: r.score, breakdown: JSON.stringify({ ...r.breakdown, reasons: r.reasons, names: r.names }),
      })),
    })
  }
  return results
}

export async function refreshCrewSuggestions(installationId: string) {
  const installation = await db.installation.findUnique({ where: { id: installationId }, include: { order: true } })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  await db.crewSuggestion.deleteMany({ where: { installationId } })
  return suggestCrews(installationId, installation.order)
}

export async function scheduleInstallation(installationId: string, input: { scheduledOn: string; slot: string; crewLeadId: string; crewTechnicianIds?: string[] }, actorId: string) {
  const installation = await db.installation.findUnique({ where: { id: installationId }, include: { order: { include: { lines: true, customer: true } } } })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  const order = installation.order
  // first scheduling needs a confirmed order; a RESCHEDULE is allowed later,
  // including once the order is READY_TO_DISPATCH or DISPATCHED (FR-6.x)
  const reschedule = installation.scheduledOn != null
  if (!reschedule && order.status !== 'CONFIRMED') {
    throw new AppError('INVALID_TRANSITION', 'The order must be confirmed before scheduling the installation.')
  }
  if (['DELIVERED', 'INSTALLED', 'CLOSED', 'CANCELLED'].includes(order.status)) {
    throw new AppError('INVALID_TRANSITION', 'This order is past scheduling.')
  }

  // every line fully reserved before READY_TO_DISPATCH (state machine guard)
  const shortage = order.lines.some((l) => l.qtyReserved < l.qty)
  if (shortage) throw new AppError('INSUFFICIENT_STOCK', 'Stock shortage on this order: dispatch is blocked until every line is reserved.')

  const lead = await db.technician.findUnique({ where: { id: input.crewLeadId }, include: { user: true } })
  if (!lead || !lead.isCrewLead) throw new AppError('VALIDATION_FAILED', 'Choose a crew lead for the job.')

  await db.$transaction(async (tx) => {
    await tx.installation.update({
      where: { id: installationId },
      data: { scheduledOn: input.scheduledOn, slot: input.slot, crewLeadId: lead.user.id, status: 'SCHEDULED', holdReason: null },
    })
    const crewIds = input.crewTechnicianIds?.length ? input.crewTechnicianIds : [input.crewLeadId]
    await tx.installationCrew.deleteMany({ where: { installationId } })
    await tx.installationCrew.createMany({
      data: crewIds.map((tid, idx) => ({ installationId, technicianId: tid, role: idx === 0 ? 'LEAD' : 'MEMBER' })),
    })
    // only the FIRST schedule advances the order; a reschedule never moves it backwards
    if (order.status === 'CONFIRMED') {
      await tx.order.update({ where: { id: order.id }, data: { status: 'READY_TO_DISPATCH' } })
    }
    const dispatch = await tx.dispatch.findFirst({ where: { orderId: order.id, status: { in: ['PICKING', 'READY'] } } })
    if (dispatch) {
      await tx.dispatch.update({ where: { id: dispatch.id }, data: { scheduledOn: input.scheduledOn, crewLeadId: lead.user.id } })
    }
    // crew suggestions depend on the date — refresh them on every scheduling pass
    await tx.crewSuggestion.deleteMany({ where: { installationId } })
    await suggestCrews(installationId, order, undefined, tx)
    await enqueue({
      channel: 'SMS',
      recipient: order.customer.phone.slice(0, 6) + 'XXXX' + order.customer.phone.slice(-3),
      template: reschedule ? 'INSTALLATION_RESCHEDULED' : 'INSTALLATION_SCHEDULED',
      payload: { to: order.customer.phone, name: order.customer.name, date: input.scheduledOn, slot: input.slot, crewLead: lead.user.name },
    }, tx)
    await audit({ actorType: 'USER', actorId, entityType: 'installation', entityId: installationId, action: reschedule ? 'reschedule' : 'schedule', after: { ...input } }, tx)
  })
  return db.installation.findUnique({ where: { id: installationId }, include: { crew: true } })
}

export async function cancelOrder(orderId: string, reason: string, actorId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: true, customer: true, payments: true } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  if (!['PENDING_ADVANCE', 'CONFIRMED', 'READY_TO_DISPATCH'].includes(order.status)) {
    throw new AppError('INVALID_TRANSITION', 'Only orders not yet dispatched can be cancelled.')
  }
  const wh = await locationByCode(WH_CODE)

  await db.$transaction(async (tx) => {
    // 1) release reservations (FR-4.7)
    for (const line of order.lines) {
      const allocs = await tx.stockAllocation.findMany({ where: { orderLineId: line.id, status: 'ACTIVE' } })
      for (const a of allocs) {
        await tx.stockAllocation.update({ where: { id: a.id }, data: { status: 'RELEASED', closedAt: new Date() } })
        await casRelease(tx, a.productId, a.locationId, a.qty)
      }
    }
    // 2) un-pick any units already scanned onto the dispatch and cancel the dispatch
    const dispatches = await tx.dispatch.findMany({ where: { orderId: order.id, status: { in: ['PICKING', 'READY'] } }, include: { lines: { include: { units: { where: { removedAt: null } } } } } })
    for (const d of dispatches) {
      for (const line of d.lines) {
        for (const du of line.units) {
          await tx.inventoryUnit.update({ where: { id: du.unitId }, data: { status: 'IN_STOCK', locationId: wh.id } })
        }
        await tx.dispatchUnit.updateMany({ where: { dispatchLineId: line.id, removedAt: null }, data: { removedAt: new Date() } })
        await tx.dispatchLine.update({ where: { id: line.id }, data: { qtyLoaded: 0 } })
      }
      await tx.dispatch.update({ where: { id: d.id }, data: { status: 'CANCELLED' } })
    }
    // 3) record the refund for every received payment (T38R7)
    let refunded = 0
    for (const p of order.payments.filter((p) => p.status === 'RECEIVED')) {
      await tx.payment.update({ where: { id: p.id }, data: { status: 'REVERSED' } })
      await tx.payment.create({
        data: {
          orderId: order.id, amountPaise: p.amountPaise, method: p.method, kind: 'REVERSAL',
          reference: `refund on cancellation: ${reason}`.slice(0, 200), receivedOn: istToday(),
          status: 'REVERSED', reversalOfId: p.id, recordedBy: actorId,
        },
      })
      refunded += p.amountPaise
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelReason: reason, paidPaise: Math.max(0, order.paidPaise - refunded) } })
    await enqueue({
      channel: 'SMS',
      recipient: order.customer.phone.slice(0, 6) + 'XXXX' + order.customer.phone.slice(-3),
      template: 'ORDER_CANCELLED',
      payload: { to: order.customer.phone, name: order.customer.name, orderNumber: order.orderNumber, reason, refundedPaise: refunded },
    }, tx)
    await audit({ actorType: 'USER', actorId, entityType: 'order', entityId: orderId, action: 'cancel', before: { status: order.status }, after: { reason, refundedPaise: refunded, dispatchesCancelled: dispatches.length } }, tx)
  })
  return { ok: true }
}

export async function orderDetail(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      lines: { include: { product: true, allocations: { where: { status: 'ACTIVE' } } } },
      payments: { orderBy: { createdAt: 'desc' } },
      dispatches: { include: { lines: { include: { product: true, units: { include: { unit: { include: { product: true } } } } } } } },
      installation: { include: { crew: { include: { technician: { include: { user: true } } } }, suggestions: true } },
      subsidy: true,
      invoices: true,
      quote: true,
    },
  })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  return order
}

export async function listOrders(status?: string) {
  return db.order.findMany({
    where: status ? { status } : undefined,
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function updateSubsidy(orderId: string, patch: { status?: string; applicationRef?: string; notes?: string; receivedPaise?: number }, actorId: string) {
  const app = await db.subsidyApplication.findUnique({ where: { orderId } })
  if (!app) throw new AppError('NOT_FOUND', 'Subsidy application not found.')
  await db.subsidyApplication.update({ where: { orderId }, data: patch })
  await audit({ actorType: 'USER', actorId, entityType: 'subsidy', entityId: app.id, action: 'update', after: patch })
  return db.subsidyApplication.findUnique({ where: { orderId } })
}
