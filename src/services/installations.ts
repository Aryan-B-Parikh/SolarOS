// Installations service (C8, FR-6.x): today's jobs, start with location,
// mandatory checklist + capacity + test reading + 3 named photos, signature
// sign-off with a SHA-256 proof hash, certificate link, hold/reschedule.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit, enqueue } from '@/lib/outbox'
import { createHash } from 'crypto'
import { istToday, toIstDateString } from '@/lib/dates'
import { withIdempotency } from '@/lib/idempotency'

export interface ChecklistState {
  standsMounted: boolean
  panelsLaid: boolean
  wiringBoxes: boolean
  earthingDone: boolean
  powerTest: boolean
}

export const EMPTY_CHECKLIST: ChecklistState = {
  standsMounted: false, panelsLaid: false, wiringBoxes: false, earthingDone: false, powerTest: false,
}

/** crew/Director access guard (P77): technicians only touch jobs they are on */
export async function requireJobAccess(installationId: string, user: { id: string; role: string }) {
  if (user.role === 'DIRECTOR') return
  const inst = await db.installation.findUnique({
    where: { id: installationId },
    include: { crew: { include: { technician: true } } },
  })
  if (!inst) throw new AppError('NOT_FOUND', 'Installation not found.')
  const onCrew = inst.crewLeadId === user.id || inst.crew.some((c) => c.technician.userId === user.id)
  if (!onCrew) {
    throw new AppError('FORBIDDEN', 'Only the assigned crew or the director can work on this installation.')
  }
}

export async function myJobsToday(userId: string, date?: string) {
  const day = date ?? istToday()
  const [surveys, installations, tickets] = await Promise.all([
    db.siteSurvey.findMany({
      where: { surveyorId: userId, status: { in: ['SCHEDULED', 'COMPLETED'] } },
      include: { lead: { include: { customer: true } } },
    }),
    db.installation.findMany({
      where: {
        OR: [{ crewLeadId: userId }, { crew: { some: { technician: { userId } } } }],
        status: { in: ['SCHEDULED', 'IN_PROGRESS', 'AWAITING_SIGNOFF'] },
      },
      include: { order: { include: { customer: true, lines: { include: { product: true } } } }, crew: { include: { technician: { include: { user: true } } } } },
    }),
    db.serviceTicket.findMany({
      where: { assignedTo: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
      include: { customer: true, unit: { include: { product: true } } },
    }),
  ])
  const surveyJobs = surveys
    .filter((s) => toIstDay(s.scheduledAt) === day)
    .map((s) => ({ kind: 'SURVEY' as const, id: s.id, title: `Site survey — ${s.lead.customer.name}`, address: `${s.lead.customer.addressLine}, ${s.lead.customer.city}`, status: s.status, when: s.scheduledAt, ref: s.lead.leadNumber }))
  // S15 "today's jobs": only installs scheduled for today, plus any job still
  // in progress or awaiting sign-off (yesterday's carry-over), never every
  // active install in the pipeline.
  const installJobs = installations
    .filter((i) => (i.scheduledOn == null ? false : i.status === 'SCHEDULED' ? i.scheduledOn === day : true))
    .map((i) => ({
      kind: 'INSTALL' as const, id: i.id, title: `${i.order.capacityKw} kW ${i.order.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'} installation — ${i.order.customer.name}`,
      address: `${i.order.customer.addressLine}, ${i.order.customer.city}`,
      status: i.status, when: i.scheduledOn, ref: i.order.orderNumber,
      crew: i.crew.map((c) => c.technician.user.name),
    }))
  const ticketJobs = tickets.map((t) => ({
    kind: 'SERVICE' as const, id: t.id, title: `Service visit — ${t.customer.name}${t.unit ? ` (${t.unit.product.name})` : ''}`,
    address: `${t.customer.addressLine}, ${t.customer.city}`, status: t.status, when: t.slaDueAt, ref: t.ticketNumber,
  }))
  return { surveys: surveyJobs, installs: installJobs, serviceVisits: ticketJobs, date: day }
}

function toIstDay(d: Date): string {
  // IST calendar day via the shared tz helpers (honours APP_TIMEZONE)
  return toIstDateString(d)
}

export async function installationDetail(id: string) {
  const installation = await db.installation.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          customer: true,
          lines: { include: { product: true } },
          dispatches: { include: { lines: { include: { units: { where: { removedAt: null }, include: { unit: { include: { product: true } } } } } } } },
          quote: { include: { lead: true } },
        },
      },
      crew: { include: { technician: { include: { user: true } } } },
      suggestions: { orderBy: { rank: 'asc' } },
      warranties: { include: { unit: { include: { product: true } } } },
    },
  })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  return installation
}

export async function startJob(installationId: string, actorId: string, coords?: { lat: number; lng: number }) {
  const installation = await db.installation.findUnique({ where: { id: installationId }, include: { order: true } })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  if (installation.status !== 'SCHEDULED') throw new AppError('INVALID_TRANSITION', 'This job has already started.')
  // the equipment must at least be on its way before work can begin
  if (!['DISPATCHED', 'DELIVERED'].includes(installation.order.status)) {
    throw new AppError('INVALID_TRANSITION', 'The installation can start only after the equipment has departed (order is ' + installation.order.status.replace('_', ' ').toLowerCase() + ').')
  }
  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.installation.update({
      where: { id: installationId },
      data: { status: 'IN_PROGRESS', startedAt: now, startLat: coords?.lat ?? null, startLng: coords?.lng ?? null },
    })
    // automatic time log for crew members (A9)
    const crew = await tx.installationCrew.findMany({ where: { installationId }, include: { technician: true } })
    for (const c of crew) {
      await tx.timeLog.create({
        data: { technicianId: c.technicianId, installationId, startedAt: now, hourlyCostPaise: c.technician.hourlyCostPaise },
      })
    }
  })
  return { ok: true }
}

export async function updateJob(installationId: string, patch: {
  checklist?: ChecklistState
  installedCapacityKw?: number
  testReadingW?: number
}, actorId: string) {
  const installation = await db.installation.findUnique({ where: { id: installationId } })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  if (!['IN_PROGRESS', 'AWAITING_SIGNOFF', 'SCHEDULED'].includes(installation.status)) {
    throw new AppError('INVALID_TRANSITION', 'This job can no longer be updated.')
  }
  const data: Record<string, unknown> = {}
  if (patch.checklist) data.checklist = JSON.stringify(patch.checklist)
  if (patch.installedCapacityKw != null) data.installedCapacityKw = patch.installedCapacityKw
  if (patch.testReadingW != null) data.testReadingW = patch.testReadingW

  // P158: IN_PROGRESS -> AWAITING_SIGNOFF happens by itself once the checklist,
  // the three named photos and the capacity + test reading are all in.
  if (installation.status === 'IN_PROGRESS') {
    const checklist = { ...EMPTY_CHECKLIST, ...JSON.parse(installation.checklist || '{}'), ...(patch.checklist ?? {}) } as ChecklistState
    const capacity = patch.installedCapacityKw ?? installation.installedCapacityKw
    const reading = patch.testReadingW ?? installation.testReadingW
    if (Object.values(checklist).every(Boolean) && capacity && reading) {
      const kinds = new Set(
        (await db.attachment.findMany({
          where: { ownerType: 'INSTALLATION', ownerId: installationId, kind: { in: ['ARRAY', 'INVERTER', 'EARTHING'] } },
          select: { kind: true },
        })).map((p) => p.kind)
      )
      if (['ARRAY', 'INVERTER', 'EARTHING'].every((k) => kinds.has(k))) {
        data.status = 'AWAITING_SIGNOFF'
      }
    }
  }
  await db.installation.update({ where: { id: installationId }, data })
  return db.installation.findUnique({ where: { id: installationId } })
}

export async function signoffJob(installationId: string, input: {
  signedName: string
  signatureAttachmentId?: string | null
  installedCapacityKw?: number
  testReadingW?: number
  checklist?: ChecklistState
  finishLat?: number | null
  finishLng?: number | null
  notes?: string
  actorId: string
  idempotencyKey?: string
}) {
  // D16: a retried sign-off with the same key replays the original result
  if (!input.idempotencyKey) return signoffJobOnce(installationId, input)
  return withIdempotency('installation.signoff', `${installationId}:${input.idempotencyKey}`, () => signoffJobOnce(installationId, input))
}

async function signoffJobOnce(installationId: string, input: {
  signedName: string
  signatureAttachmentId?: string | null
  installedCapacityKw?: number
  testReadingW?: number
  checklist?: ChecklistState
  finishLat?: number | null
  finishLng?: number | null
  notes?: string
  actorId: string
}) {
  const installation = await db.installation.findUnique({
    where: { id: installationId },
    include: {
      order: { include: { customer: true, lines: true, dispatches: { include: { lines: { include: { units: { where: { removedAt: null }, include: { unit: true } } } } } } } },
    },
  })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  if (installation.status === 'SCHEDULED') {
    throw new AppError('INVALID_TRANSITION', 'Start the job first — sign-off needs the checklist, the three named photos and the capacity/test reading.')
  }
  if (!['IN_PROGRESS', 'AWAITING_SIGNOFF'].includes(installation.status)) {
    throw new AppError('INVALID_TRANSITION', 'This job cannot be signed off.')
  }

  // the client may send its full current checklist (draft-resilient UI);
  // it wins over the stored copy so sign-off reflects what was actually confirmed
  const checklist = { ...EMPTY_CHECKLIST, ...JSON.parse(installation.checklist || '{}'), ...(input.checklist ?? {}) } as ChecklistState
  const allDone = Object.values(checklist).every(Boolean)
  if (!allDone) throw new AppError('CHECKLIST_INCOMPLETE', 'Every checklist item (stands, panels, wiring, earthing, power test) must be confirmed before sign-off.')

  const photos = await db.attachment.findMany({ where: { ownerType: 'INSTALLATION', ownerId: installationId, kind: { in: ['ARRAY', 'INVERTER', 'EARTHING'] } } })
  const kinds = new Set(photos.map((p) => p.kind))
  const missing = (['ARRAY', 'INVERTER', 'EARTHING'] as const).filter((k) => !kinds.has(k))
  if (missing.length > 0) {
    throw new AppError('PHOTOS_REQUIRED', `Required photos missing: ${missing.map((m) => m.toLowerCase()).join(', ')}.`)
  }

  const capacity = input.installedCapacityKw ?? installation.installedCapacityKw
  const reading = input.testReadingW ?? installation.testReadingW
  if (!capacity || !reading) throw new AppError('VALIDATION_FAILED', 'Installed capacity (kWp) and the generation test reading (W) are both required.')

  // P158 lifecycle: everything the customer signs for is in place, so an
  // in-progress job moves to AWAITING_SIGNOFF now (the update endpoint does
  // this automatically; a direct sign-off gets the same promotion).
  if (installation.status === 'IN_PROGRESS') {
    await db.installation.update({ where: { id: installationId }, data: { status: 'AWAITING_SIGNOFF', checklist: JSON.stringify(checklist), installedCapacityKw: capacity, testReadingW: reading } })
  }

  // the customer must have the equipment in hand before signing for the work
  if (installation.order.status !== 'DELIVERED') {
    throw new AppError('INVALID_TRANSITION', `The customer must confirm delivery on site before sign-off (order is ${installation.order.status.replace('_', ' ').toLowerCase()}).`)
  }

  const now = new Date()
  const serials = installation.order.dispatches
    .flatMap((d) => d.lines.flatMap((l) => l.units.map((u) => u.unit.serialNumber)))
    .sort()

  // proof integrity: sha256 of job id, signed name, time, capacity, serials, signature (TRD 2.6)
  const signoffHash = createHash('sha256')
    .update([installationId, input.signedName, now.toISOString(), String(capacity), serials.join(','), input.signatureAttachmentId ?? ''].join('|'))
    .digest('hex')

  const { issueLink } = await import('@/lib/access-links')
  const { sha256 } = await import('@/lib/auth')
  const certToken = (await issueLink(installation.order.customerId, 'CERTIFICATE', input.actorId, 3650)).token

  const signoffWarrantyCountBefore = await db.warranty.count({ where: { installationId, source: 'INSTALLATION_SIGNOFF' } })
  const order = await db.order.findUnique({ where: { id: installation.orderId }, include: { payments: true } })
  const paid = order ? order.payments.filter((p) => p.status === 'RECEIVED').reduce((s, p) => s + p.amountPaise, 0) : 0

  // the whole completion — status flips, time logs, units, warranties, order and
  // the final invoice — lands in ONE transaction (D1): no half-completed job
  await db.$transaction(async (tx) => {
    await tx.installation.update({
      where: { id: installationId },
      data: {
        status: 'COMPLETED', finishedAt: now, signedName: input.signedName, signedAt: now,
        signatureAttachmentId: input.signatureAttachmentId ?? null, signoffHash,
        certificateTokenHash: sha256(certToken), installedCapacityKw: capacity, testReadingW: reading,
        checklist: JSON.stringify(checklist),
        finishLat: input.finishLat ?? null, finishLng: input.finishLng ?? null,
      },
    })

    // close time logs
    await tx.timeLog.updateMany({ where: { installationId, endedAt: null }, data: { endedAt: now } })

    // units -> INSTALLED; warranties for basis INSTALLATION_SIGNOFF (A6)
    const sites = await tx.stockLocation.findUnique({ where: { code: 'SITES' } })
    for (const d of installation.order.dispatches) {
      for (const l of d.lines) {
        for (const u of l.units) {
          await tx.inventoryUnit.update({ where: { id: u.unitId }, data: { status: 'INSTALLED', locationId: sites!.id, installationId } })
          const unitFull = await tx.inventoryUnit.findUnique({ where: { id: u.unitId }, include: { product: true } })
          if (unitFull?.product.warrantyStartBasis === 'INSTALLATION_SIGNOFF') {
            const { computeEndDate } = await import('@/domain/warranty')
            const start = istToday()
            await tx.warranty.create({
              data: {
                unitId: u.unitId, installationId, customerId: installation.order.customerId,
                productId: unitFull.productId, coverage: 'EQUIPMENT', startDate: start,
                endDate: computeEndDate(start, unitFull.product.warrantyMonths),
                months: unitFull.product.warrantyMonths, status: 'ACTIVE', source: 'INSTALLATION_SIGNOFF',
              },
            })
          }
        }
      }
    }

    await tx.order.update({ where: { id: installation.orderId }, data: { status: 'INSTALLED' } })

    // final invoice is ALWAYS issued at completion (T38R5) and covers the
    // outstanding balance, not the full order value again (FR-8.7)
    await createInvoiceForOrder(installation.orderId, 'FINAL', paid, tx)

    await enqueue({
      channel: 'SMS',
      recipient: installation.order.customer.phone.slice(0, 6) + 'XXXX' + installation.order.customer.phone.slice(-3),
      template: 'INSTALLATION_COMPLETED',
      payload: { to: installation.order.customer.phone, name: installation.order.customer.name, orderNumber: installation.order.orderNumber, link: `/c/${certToken}` },
    }, tx)
    await audit({
      actorType: 'USER', actorId: input.actorId, entityType: 'installation', entityId: installationId, action: 'signoff',
      after: { signedName: input.signedName, signoffHash, ...(input.notes ? { notes: input.notes } : {}) },
    }, tx)
  })

  // FR-10.5: signoff-basis warranties just activated — point the customer at
  // their printable warranty documents on the portal through the outbox.
  const signoffWarrantyCount = await db.warranty.count({ where: { installationId, source: 'INSTALLATION_SIGNOFF' } })
  if (signoffWarrantyCount > signoffWarrantyCountBefore) {
    const { token: portalToken } = await issueLink(installation.order.customerId, 'PORTAL', input.actorId, 90)
    await enqueue({
      channel: 'SMS',
      recipient: installation.order.customer.phone.slice(0, 6) + 'XXXX' + installation.order.customer.phone.slice(-3),
      template: 'WARRANTY_ACTIVATED',
      payload: { to: installation.order.customer.phone, name: installation.order.customer.name, count: signoffWarrantyCount, link: `/p/${portalToken}` },
    })
  }
  return { ok: true, certificateToken: certToken, signoffHash }
}

export async function holdJob(installationId: string, reason: string, newDate: string | null, actorId: string) {
  const installation = await db.installation.findUnique({ where: { id: installationId }, include: { order: { include: { customer: true } } } })
  if (!installation) throw new AppError('NOT_FOUND', 'Installation not found.')
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(installation.status)) {
    throw new AppError('INVALID_TRANSITION', 'Only scheduled or in-progress jobs can be put on hold.')
  }
  if (!reason) throw new AppError('VALIDATION_FAILED', 'A hold reason is required (rain, customer absent, site not ready).')
  const customer = installation.order.customer
  await db.$transaction(async (tx) => {
    await tx.installation.update({ where: { id: installationId }, data: { status: 'ON_HOLD', holdReason: reason } })
    if (newDate) {
      // ON_HOLD returns to SCHEDULED with a new date (P158)
      await tx.installation.update({ where: { id: installationId }, data: { status: 'SCHEDULED', scheduledOn: newDate, holdReason: reason } })
      await tx.dispatch.updateMany({ where: { orderId: installation.orderId, status: { in: ['PICKING', 'READY'] } }, data: { scheduledOn: newDate } })
      await tx.crewSuggestion.deleteMany({ where: { installationId } })
    }
    // the customer is told about the hold/reschedule immediately (FR-6.x)
    await enqueue({
      channel: 'SMS',
      recipient: customer.phone.slice(0, 6) + 'XXXX' + customer.phone.slice(-3),
      template: newDate ? 'INSTALLATION_RESCHEDULED' : 'INSTALLATION_ON_HOLD',
      payload: { to: customer.phone, name: customer.name, orderNumber: installation.order.orderNumber, reason, newDate },
    }, tx)
    await audit({ actorType: 'USER', actorId, entityType: 'installation', entityId: installationId, action: 'hold', after: { reason, newDate } }, tx)
  })
  if (newDate) {
    // crew suggestions depend on the date — re-run them for the new one
    const { refreshCrewSuggestions } = await import('@/services/orders')
    await refreshCrewSuggestions(installationId).catch(() => {})
  }
  return { ok: true }
}

export async function createInvoiceForOrder(orderId: string, kind: 'ADVANCE' | 'FINAL', paidPaise?: number, tx?: import('@/lib/outbox').DbClient) {
  const client = tx ?? db
  const order = await client.order.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true } }, payments: true, customer: true } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  const paid = paidPaise ?? order.payments.filter((p) => p.status === 'RECEIVED').reduce((s, p) => s + p.amountPaise, 0)
  const invoiceNumber = await nextInvoiceNumber(client)
  const total = order.totalPaise
  const balance = Math.max(0, total - paid)
  let subtotal: number, tax: number
  let lines: { productId: string; description: string; qty: number; unitPricePaise: number; taxRateBp: number; lineTotalPaise: number }[]
  if (kind === 'FINAL' && paid > 0 && balance < total) {
    // the advance was already receipted: the final invoice covers only the
    // outstanding balance (FR-8.7), as a single balance line
    subtotal = balance
    tax = 0
    lines = [{
      productId: order.lines[0]?.productId ?? '',
      description: `Balance payment on completion — order ${order.orderNumber} (advance already received)`,
      qty: 1, unitPricePaise: balance, taxRateBp: 0, lineTotalPaise: balance,
    }]
  } else {
    subtotal = order.subtotalPaise - order.discountPaise
    tax = order.taxPaise
    lines = order.lines.map((l) => ({
      productId: l.productId, description: l.description, qty: l.qty,
      unitPricePaise: l.unitPricePaise, taxRateBp: l.taxRateBp,
      lineTotalPaise: Math.round(l.qty * l.unitPricePaise),
    }))
  }
  const invoice = await client.invoice.create({
    data: {
      invoiceNumber, customerId: order.customerId, orderId, type: 'SALE',
      issueDate: istToday(),
      dueDate: (() => { const t = new Date(Date.now() + 15 * 86400000 + 330 * 60000); return t.toISOString().slice(0, 10) })(),
      subtotalPaise: subtotal, taxPaise: tax, totalPaise: subtotal + tax,
      status: paid >= total ? 'PAID' : 'ISSUED',
      lines: { create: lines },
    },
  })
  return invoice
}

async function nextInvoiceNumber(client: import('@/lib/outbox').DbClient): Promise<string> {
  const { nextNumber } = await import('@/lib/ids')
  return nextNumber('INVOICE', 'INV', client)
}

export async function listInstallations(weekOf?: string) {
  const installations = await db.installation.findMany({
    include: { order: { include: { customer: true } }, crew: { include: { technician: { include: { user: true } } } } },
    orderBy: { scheduledOn: 'asc' },
  })
  return installations
}
