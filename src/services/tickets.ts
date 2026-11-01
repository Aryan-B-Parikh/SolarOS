// Service & warranty service (C9, FR-7.x): one search finds everything,
// ticket opening decides warranty eligibility automatically (Automation 5),
// replacements inherit the remaining warranty period (Q3) with the original
// kept as TRANSFERRED history (D5), tickets close only on customer confirmation.

import { db } from '@/lib/db'
import { parseScannedCode } from '@/lib/qr'
import { AppError } from '@/lib/errors'
import { nextNumber } from '@/lib/ids'
import { audit, enqueue } from '@/lib/outbox'
import { getSettings } from '@/lib/settings'
import { eligibility } from '@/domain/warranty'
import { TICKET_TRANSITIONS, TicketStatus } from '@/domain/state-machines'
import { istToday } from '@/lib/dates'

export async function warrantyCheck(codeOrSerial: string) {
  // the service desk scans the printed label — accept URL, path or bare code
  const code = parseScannedCode(codeOrSerial)
  const unit = await db.inventoryUnit.findFirst({
    where: { OR: [{ qrCode: code }, { serialNumber: code }] },
    include: { product: true, customer: true, warranties: true },
  })
  if (!unit) {
    return { unit: null, customer: null, warranty: null, verdict: 'UNKNOWN_UNIT' as const, billingMode: 'CHARGEABLE' as const }
  }
  const active = unit.warranties.find((w) => w.status === 'ACTIVE')
  const verdict = eligibility(unit, active ?? null)
  const { daysLeft } = await import('@/domain/warranty')
  return {
    unit: { id: unit.id, serialNumber: unit.serialNumber, product: unit.product.name, status: unit.status },
    customer: unit.customer ? { id: unit.customer.id, name: unit.customer.name, phone: unit.customer.phone } : null,
    warranty: active ? { id: active.id, startDate: active.startDate, endDate: active.endDate, daysLeft: daysLeft(active) } : null,
    verdict: verdict.verdict,
    billingMode: verdict.billingMode,
  }
}

export async function openTicket(input: {
  customerId: string
  unitId?: string | null
  channel: string
  category: string
  faultCode?: string | null
  description: string
  priority?: string
  createdBy?: string | null
}) {
  const settings = await getSettings()
  const customer = await db.customer.findUnique({ where: { id: input.customerId } })
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.')

  let installationId: string | null = null
  if (input.unitId) {
    const found = await db.inventoryUnit.findUnique({ where: { id: input.unitId }, include: { product: true } })
    if (!found) throw new AppError('NOT_FOUND', 'Unit not found.')
    installationId = found.installationId
  }

  const verdict = input.unitId
    ? await warrantyCheck((await db.inventoryUnit.findUnique({ where: { id: input.unitId } }))!.serialNumber)
    : { unit: null, customer: null, warranty: null, verdict: 'UNKNOWN_UNIT' as const, billingMode: 'CHARGEABLE' as const }

  const ticketNumber = await nextNumber('TICKET', 'T')
  const priority = input.priority ?? 'NORMAL'
  const slaHours = settings.slaHoursByPriority[priority] ?? 72
  const ticket = await db.serviceTicket.create({
    data: {
      ticketNumber, customerId: input.customerId, installationId,
      unitId: input.unitId ?? null, warrantyId: verdict.warranty?.id ?? null,
      channel: input.channel, category: input.category, faultCode: input.faultCode ?? null,
      description: input.description, priority,
      status: 'OPEN', warrantyVerdict: verdict.verdict, billingMode: verdict.billingMode,
      slaDueAt: new Date(Date.now() + slaHours * 3600 * 1000),
      createdBy: input.createdBy ?? null,
    },
  })
  await db.ticketEvent.create({
    data: { ticketId: ticket.id, type: 'CREATED', toStatus: 'OPEN', note: `Ticket opened via ${input.channel.toLowerCase()}. Warranty verdict: ${verdict.verdict.replace(/_/g, ' ').toLowerCase()}.`, actorId: input.createdBy ?? null },
  })
  await enqueue({
    channel: 'SMS',
    recipient: customer.phone.slice(0, 6) + 'XXXX' + customer.phone.slice(-3),
    template: 'TICKET_OPENED',
    payload: { to: customer.phone, name: customer.name, ticketNumber, verdict: verdict.verdict },
  })
  await audit({ actorType: input.createdBy ? 'USER' : 'CUSTOMER', actorId: input.createdBy, entityType: 'ticket', entityId: ticket.id, action: 'open', after: { ticketNumber, verdict: verdict.verdict } })
  return db.serviceTicket.findUnique({ where: { id: ticket.id } })
}

export async function ticketDetail(ticketId: string) {
  const ticket = await db.serviceTicket.findUnique({
    where: { id: ticketId },
    include: {
      customer: true,
      unit: { include: { product: true, warranties: true } },
      installation: { include: { order: true } },
      warranty: true,
      events: { orderBy: { createdAt: 'asc' } },
      parts: { include: { product: true } },
    },
  })
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.')
  // T3: ticket photos (staff uploads + portal customer evidence) — served
  // through /api/v1/files/{id}, which checks session/portal ownership.
  const photos = await db.attachment.findMany({
    where: { ownerType: 'TICKET', ownerId: ticketId },
    orderBy: { createdAt: 'asc' },
  })
  return {
    ...ticket,
    photos: photos.map((p) => ({
      id: p.id,
      kind: p.kind,
      mime: p.mime,
      sizeBytes: p.sizeBytes,
      storage: p.storage,
      uploadedBy: p.uploadedBy,
      createdAt: p.createdAt,
      url: `/api/v1/files/${p.id}`,
    })),
  }
}

export async function assignTicket(ticketId: string, technicianUserId: string, actorId: string) {
  const ticket = await db.serviceTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(TICKET_TRANSITIONS, ticket.status as TicketStatus, 'ASSIGNED', 'This ticket')
  await db.serviceTicket.update({ where: { id: ticketId }, data: { status: 'ASSIGNED', assignedTo: technicianUserId } })
  await db.ticketEvent.create({ data: { ticketId, type: 'ASSIGNED', fromStatus: 'OPEN', toStatus: 'ASSIGNED', actorId } })
  return ticketDetail(ticketId)
}

export async function startTicket(ticketId: string, actorId: string) {
  const ticket = await db.serviceTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(TICKET_TRANSITIONS, ticket.status as TicketStatus, 'IN_PROGRESS', 'This ticket')
  await db.serviceTicket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS' } })
  await db.ticketEvent.create({ data: { ticketId, type: 'STARTED', fromStatus: ticket.status, toStatus: 'IN_PROGRESS', actorId } })
  const tech = await db.technician.findUnique({ where: { userId: actorId } })
  if (tech) {
    await db.timeLog.create({ data: { technicianId: tech.id, ticketId, startedAt: new Date(), hourlyCostPaise: tech.hourlyCostPaise } })
  }
  return ticketDetail(ticketId)
}

export async function resolveTicket(ticketId: string, input: {
  resolutionNotes: string
  parts?: { productId: string; qty: number; installedUnitId?: string | null; removedUnitId?: string | null }[]
  labourHours?: number
  actorId: string
}) {
  const ticket = await db.serviceTicket.findUnique({ where: { id: ticketId }, include: { unit: { include: { product: true, warranties: true } }, customer: true } })
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(TICKET_TRANSITIONS, ticket.status as TicketStatus, 'RESOLVED', 'This ticket')
  if (!input.resolutionNotes) throw new AppError('VALIDATION_FAILED', 'Resolution notes are required.')

  const chargeable = ticket.billingMode === 'CHARGEABLE'
  let invoiceTotal = 0
  const labourRateBase = (await db.technician.findFirst())?.hourlyCostPaise ?? 30000
  const labourRateBilled = Math.round(labourRateBase * 1.5)

  for (const part of input.parts ?? []) {
    const product = await db.product.findUnique({ where: { id: part.productId } })
    if (!product) continue
    await db.ticketPart.create({
      data: {
        ticketId, productId: part.productId, qty: part.qty,
        removedUnitId: part.removedUnitId ?? null, installedUnitId: part.installedUnitId ?? null,
        unitPricePaise: product.salePricePaise, chargeable,
      },
    })
    if (chargeable) invoiceTotal += Math.round(product.salePricePaise * part.qty)

    // replacement flow: old unit -> RMA/REPLACED, new unit installed, warranty inherits (Q3, D5)
    if (part.removedUnitId && part.installedUnitId) {
      const oldUnit = await db.inventoryUnit.findUnique({ where: { id: part.removedUnitId }, include: { warranties: true } })
      const newUnit = await db.inventoryUnit.findUnique({ where: { id: part.installedUnitId }, include: { product: true } })
      if (oldUnit && newUnit) {
        const originalWarranty = oldUnit.warranties.find((w) => w.status === 'ACTIVE')
        await db.inventoryUnit.update({ where: { id: oldUnit.id }, data: { status: 'REPLACED', replacedByUnitId: newUnit.id } })
        await db.inventoryUnit.update({
          where: { id: newUnit.id },
          data: {
            status: 'INSTALLED', customerId: ticket.customerId, installationId: ticket.installationId,
            orderId: oldUnit.orderId, deliveredOn: oldUnit.deliveredOn,
          },
        })
        if (originalWarranty) {
          await db.warranty.update({ where: { id: originalWarranty.id }, data: { status: 'TRANSFERRED' } })
          await db.warranty.create({
            data: {
              unitId: newUnit.id, installationId: originalWarranty.installationId, customerId: ticket.customerId,
              productId: newUnit.productId, coverage: 'EQUIPMENT',
              startDate: istToday(), endDate: originalWarranty.endDate, // inherits remaining period (Q3)
              months: originalWarranty.months, status: 'ACTIVE', source: 'REPLACEMENT',
              parentWarrantyId: originalWarranty.id,
            },
          })
        }
        await db.stockMovement.create({
          data: {
            productId: oldUnit.productId, unitId: oldUnit.id, qty: 1, type: 'RMA_OUT',
            fromLocationId: (await db.stockLocation.findUnique({ where: { code: 'SITES' } }))!.id,
            toLocationId: (await db.stockLocation.findUnique({ where: { code: 'RMA' } }))!.id,
            unitCostPaise: oldUnit.unitCostPaise, refType: 'ticket', refId: ticketId, createdBy: input.actorId,
          },
        })
      }
    }
  }

  // labour billing (chargeable)
  if (chargeable && (input.labourHours ?? 0) > 0) {
    invoiceTotal += Math.round(labourRateBilled * input.labourHours!)
  }

  // close technician time log
  await db.timeLog.updateMany({ where: { ticketId, endedAt: null }, data: { endedAt: new Date() } })

  // chargeable invoice generated on resolution (FR-7.4)
  if (chargeable && invoiceTotal > 0) {
    const { nextNumber } = await import('@/lib/ids')
    const invoiceNumber = await nextNumber('INVOICE', 'INV')
    const partLines: { productId: string | null; description: string; qty: number; unitPricePaise: number; taxRateBp: number; lineTotalPaise: number }[] = []
    for (const p of input.parts ?? []) {
      const product = await db.product.findUnique({ where: { id: p.productId } })
      partLines.push({
        productId: p.productId, description: `Part: ${product?.name ?? 'Part'}`, qty: p.qty,
        unitPricePaise: product?.salePricePaise ?? 0, taxRateBp: 1800,
        lineTotalPaise: Math.round((product?.salePricePaise ?? 0) * p.qty),
      })
    }
    if ((input.labourHours ?? 0) > 0) {
      partLines.push({
        productId: null, description: `Labour (${input.labourHours} h)`, qty: input.labourHours!,
        unitPricePaise: labourRateBilled, taxRateBp: 1800, lineTotalPaise: Math.round(labourRateBilled * input.labourHours!),
      })
    }
    const subtotal = Math.round(invoiceTotal / 1.18)
    await db.invoice.create({
      data: {
        invoiceNumber, customerId: ticket.customerId, ticketId, type: 'SERVICE',
        issueDate: istToday(),
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10), // instant + 15d, IST-extracted below
        // (kept simple: due dates only display)
        subtotalPaise: subtotal, taxPaise: invoiceTotal - subtotal, totalPaise: invoiceTotal,
        status: 'ISSUED', lines: { create: partLines },
      },
    })
  }

  await db.serviceTicket.update({ where: { id: ticketId }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNotes: input.resolutionNotes } })
  await db.ticketEvent.create({
    data: { ticketId, type: 'RESOLVED', fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', note: input.resolutionNotes, actorId: input.actorId },
  })
  await enqueue({
    channel: 'SMS',
    recipient: ticket.customer.phone.slice(0, 6) + 'XXXX' + ticket.customer.phone.slice(-3),
    template: 'TICKET_RESOLVED',
    payload: { to: ticket.customer.phone, name: ticket.customer.name, ticketNumber: ticket.ticketNumber, chargeable },
  })
  await audit({ actorType: 'USER', actorId: input.actorId, entityType: 'ticket', entityId: ticketId, action: 'resolve', after: { notes: input.resolutionNotes, invoiceTotal } })
  return ticketDetail(ticketId)
}

export async function confirmTicket(ticketId: string, method: 'PORTAL' | 'PHONE', actorId?: string | null) {
  const ticket = await db.serviceTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(TICKET_TRANSITIONS, ticket.status as TicketStatus, 'CLOSED', 'This ticket')
  await db.serviceTicket.update({
    where: { id: ticketId },
    data: { status: 'CLOSED', customerConfirmedAt: new Date(), confirmationMethod: method, closedAt: new Date() },
  })
  await db.ticketEvent.create({ data: { ticketId, type: 'CONFIRMED', fromStatus: 'RESOLVED', toStatus: 'CLOSED', note: `Customer confirmed the fix via ${method.toLowerCase()}.`, actorId: actorId ?? null } })
  return ticketDetail(ticketId)
}

export async function reopenTicket(ticketId: string, note: string, actorId?: string | null) {
  const ticket = await db.serviceTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(TICKET_TRANSITIONS, ticket.status as TicketStatus, 'IN_PROGRESS', 'This ticket')
  await db.serviceTicket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS', reopenCount: ticket.reopenCount + 1 } })
  await db.ticketEvent.create({ data: { ticketId, type: 'REOPENED', fromStatus: 'RESOLVED', toStatus: 'IN_PROGRESS', note: note || 'Customer reported the issue is not fixed.', actorId: actorId ?? null } })
  return ticketDetail(ticketId)
}

export async function listTickets(status?: string) {
  return db.serviceTicket.findMany({
    where: status ? { status } : undefined,
    include: { customer: true, unit: { include: { product: true } }, warranty: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function searchEverything(q: string) {
  const trimmed = parseScannedCode(q.trim())
  if (!trimmed) return { customers: [], units: [], orders: [], tickets: [], leads: [] }
  const digits = trimmed.replace(/\D/g, '')
  const [customers, units, orders, tickets, leads] = await Promise.all([
    db.customer.findMany({
      where: digits.length >= 4
        ? { OR: [{ phone: { contains: digits } }, { name: { contains: trimmed } }, { customerNumber: { contains: trimmed.toUpperCase() } }] }
        : { OR: [{ name: { contains: trimmed } }, { customerNumber: { contains: trimmed.toUpperCase() } }] },
      take: 5,
    }),
    db.inventoryUnit.findMany({
      where: { OR: [{ serialNumber: { contains: trimmed } }, { qrCode: { contains: trimmed.toUpperCase() } }] },
      include: { product: true, customer: true, warranties: true },
      take: 5,
    }),
    db.order.findMany({ where: { OR: [{ orderNumber: { contains: trimmed.toUpperCase() } }] }, include: { customer: true }, take: 5 }),
    db.serviceTicket.findMany({ where: { ticketNumber: { contains: trimmed.toUpperCase() } }, include: { customer: true }, take: 5 }),
    db.lead.findMany({ where: { leadNumber: { contains: trimmed.toUpperCase() } }, include: { customer: true }, take: 5 }),
  ])
  return { customers, units, orders, tickets, leads }
}

export async function customerDetail(customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      leads: { orderBy: { createdAt: 'desc' } },
      orders: { orderBy: { createdAt: 'desc' }, include: { installation: true, payments: true } },
      units: { where: { status: { in: ['DELIVERED', 'INSTALLED', 'RMA'] } }, include: { product: true, warranties: true } },
      warranties: { include: { unit: { include: { product: true } } } },
      tickets: { orderBy: { createdAt: 'desc' }, include: { unit: { include: { product: true } } } },
      invoices: { orderBy: { issueDate: 'desc' } },
    },
  })
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.')
  return customer
}
