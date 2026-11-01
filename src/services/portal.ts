// Customer portal service (FR-10.x): everything the customer sees from one
// expiring link — the eight-stage tracker, quote decision, installation date,
// equipment with serials, warranty bars, gallery, certificate, invoices and
// service requests with the automatic warranty verdict.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { verifyLink, verifyPhoneDigits, VerifiedLink, issueLink } from '@/lib/access-links'
import { customerStage } from '@/domain/state-machines'
import { publicQuoteByToken, acceptQuote, rejectQuote } from '@/services/quotes'
import { daysLeft } from '@/domain/warranty'
import { getSettings } from '@/lib/settings'
import { isPortalVerified } from '@/lib/portal-verify'
import { presignFile } from '@/lib/signed-url'
import { parseScannedCode } from '@/lib/qr'
import { istToday } from '@/lib/dates'

export async function portalBundle(token: string) {
  const link = await verifyLink(token, 'PORTAL')
  const customer = await db.customer.findUnique({
    where: { id: link.customerId },
    include: {
      leads: { orderBy: { createdAt: 'desc' }, include: { quotes: { orderBy: { version: 'desc' } } } },
      orders: { orderBy: { createdAt: 'desc' }, include: { installation: true, invoices: true, payments: true } },
      units: { where: { status: { in: ['DELIVERED', 'INSTALLED'] } }, include: { product: true, warranties: true } },
      warranties: { include: { unit: { include: { product: true } } } },
      tickets: { orderBy: { createdAt: 'desc' }, include: { unit: { include: { product: true } } } },
      invoices: { orderBy: { issueDate: 'desc' } },
    },
  })
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.')
  const settings = await getSettings()

  const lead = customer.leads[0]
  const order = customer.orders[0]
  const { stage, message } = customerStage(
    (lead?.status ?? null) as never,
    order
      ? { status: order.status as never, paidPaise: order.paidPaise, advanceRequiredPaise: order.advanceRequiredPaise }
      : null,
    customer.tickets.length > 0,
  )

  const installation = order?.installation ?? null
  let crewLeadName: string | null = null
  if (installation?.crewLeadId) {
    const u = await db.user.findUnique({ where: { id: installation.crewLeadId } })
    crewLeadName = u?.name ?? null
  }

  const photos = installation
    ? await db.attachment.findMany({ where: { ownerType: 'INSTALLATION', ownerId: installation.id, kind: { in: ['ARRAY', 'INVERTER', 'EARTHING', 'EXTRA'] } }, orderBy: { createdAt: 'asc' } })
    : []
  const beforePhotos = lead
    ? await db.attachment.findMany({
        where: { kind: 'SURVEY', ownerType: 'SURVEY', ownerId: { in: (await db.siteSurvey.findMany({ where: { leadId: lead.id }, select: { id: true } })).map((s) => s.id) } },
      })
    : []

  // T3: photos attached to the customer's service requests (staff uploads and
  // their own portal evidence) — private, so served via 5-minute presigned URLs
  const ticketPhotos = customer.tickets.length > 0
    ? await db.attachment.findMany({
        where: { ownerType: 'TICKET', ownerId: { in: customer.tickets.map((t) => t.id) } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const warrantyBars = customer.warranties
    .filter((w) => w.status !== 'TRANSFERRED')
    .map((w) => ({
      id: w.id,
      product: w.unit?.product.name ?? 'Equipment',
      serial: w.unit?.serialNumber ?? '',
      startDate: w.startDate,
      endDate: w.endDate,
      daysLeft: daysLeft(w),
      status: w.status,
      source: w.source,
      months: w.months,
      coverage: w.coverage,
      monitoringUrl: w.unit?.product.monitoringUrl ?? null,
    }))

  // P83: the payment history (like invoices) is sensitive — it is included only
  // while the 30-minute verified state from the last-4 check is live; the
  // aggregate "paid so far" on the tracker stays visible.
  const verified = await isPortalVerified(token)

  return {
    // NOTE: phoneLast4 is deliberately NOT sent — the customer must type it.
    customer: { name: customer.name, phoneLast4: customer.phone ? customer.phone.slice(-4) : null },
    company: { name: settings.companyName, phone: settings.phone, email: settings.email },
    stage, message,
    verified,
    lead: lead ? { number: lead.leadNumber, status: lead.status } : null,
    // FR-3.8: the portal must never leak internal margin fields — send only the
    // customer-safe subset (the public quote view has its own serializer too).
    quote: safeQuote(lead?.quotes.find((q) => q.status === 'SENT') ?? lead?.quotes[0] ?? null),
    order: order
      ? {
          id: order.id, // T2: the pay-online flow addresses the order by id (ownership-checked server-side)
          number: order.orderNumber, status: order.status, totalPaise: order.totalPaise,
          paidPaise: order.paidPaise, advanceRequiredPaise: order.advanceRequiredPaise,
          capacityKw: order.capacityKw, systemType: order.systemType,
        }
      : null,
    installation: installation
      ? {
          status: installation.status, scheduledOn: installation.scheduledOn, slot: installation.slot,
          crewLeadName, installedCapacityKw: installation.installedCapacityKw,
          certificateReady: installation.status === 'COMPLETED',
        }
      : null,
    equipment: customer.units.map((u) => ({
      serial: u.serialNumber, product: u.product.name, category: u.product.category,
      monitoringUrl: u.product.monitoringUrl,
      warranty: u.warranties.find((w) => w.status === 'ACTIVE') ?? null,
    })),
    warrantyBars,
    gallery: { after: photos.map(toPhoto), before: beforePhotos.map(toPhoto) },
    tickets: customer.tickets.map((t) => ({
      number: t.ticketNumber, status: t.status, category: t.category, description: t.description,
      verdict: t.warrantyVerdict, billingMode: t.billingMode, createdAt: t.createdAt,
      resolvedAt: t.resolvedAt, unit: t.unit?.product.name ?? null, priority: t.priority,
      photos: ticketPhotos.filter((p) => p.ownerId === t.id).map(toPhoto),
    })),
    invoices: customer.invoices.map((i) => ({ id: i.id, number: i.invoiceNumber, type: i.type, issueDate: i.issueDate, totalPaise: i.totalPaise, status: i.status })),
    payments: verified
      ? customer.orders.flatMap((o) => o.payments.filter((p) => p.status === 'RECEIVED').map((p) => ({ amountPaise: p.amountPaise, method: p.method, receivedOn: p.receivedOn, kind: p.kind })))
      : null,
  }
}

function toPhoto(a: { id: string; kind: string; takenAt: Date | null }) {
  // D14: photos are private — the portal gets a 5-minute presigned URL that is
  // issued only after the token check (this bundle call).
  return { id: a.id, kind: a.kind, url: presignFile(a.id), takenAt: a.takenAt }
}

/** customer-safe quote projection — no margin/std-cost internals (FR-3.8) */
function safeQuote(q: {
  quoteNumber: string; status: string; version: number; capacityKw: number; systemType: string
  subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number
  subsidyEstimatePaise: number; validUntil: string | null
} | null | undefined) {
  if (!q) return null
  return {
    quoteNumber: q.quoteNumber, status: q.status, version: q.version,
    capacityKw: q.capacityKw, systemType: q.systemType,
    subtotalPaise: q.subtotalPaise, discountPaise: q.discountPaise, taxPaise: q.taxPaise,
    totalPaise: q.totalPaise, subsidyEstimatePaise: q.subsidyEstimatePaise, validUntil: q.validUntil,
  }
}

export async function portalVerify(token: string, last4: string) {
  // works for any scope (PORTAL or QUOTE): resolve the link by hash
  const { sha256 } = await import('@/lib/auth')
  const linkRow = await db.customerAccessLink.findUnique({ where: { tokenHash: sha256(token) } })
  if (!linkRow) throw new AppError('LINK_EXPIRED', 'This link is not valid.')
  const link: VerifiedLink = { linkId: linkRow.id, customerId: linkRow.customerId, scope: linkRow.scope as 'PORTAL' | 'QUOTE' | 'CERTIFICATE' }
  const customer = await db.customer.findUnique({ where: { id: link.customerId } })
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.')
  const ok = await verifyPhoneDigits(link, last4, customer.phone)
  if (!ok) {
    const fresh = await db.customerAccessLink.findUnique({ where: { id: link.linkId } })
    if (fresh && fresh.failedAttempts >= 5) {
      throw new AppError('LINK_LOCKED', 'Too many wrong attempts. This link is locked for 15 minutes.')
    }
    throw new AppError('VERIFICATION_REQUIRED', 'Those digits do not match the registered phone number.')
  }
  // P83: the verified state lasts 30 minutes in an httpOnly cookie bound to the token
  const { markPortalVerified } = await import('@/lib/portal-verify')
  await markPortalVerified(token)
  return { ok: true, verifiedForMinutes: 30 }
}

export async function portalRaiseTicket(token: string, input: { category: string; description: string; faultCode?: string; unitId?: string; photoIds?: string[] }) {
  // P83: raising a ticket needs the last-4 verification
  const { requirePortalVerified } = await import('@/lib/portal-verify')
  await requirePortalVerified(token)
  const link = await verifyLink(token, 'PORTAL')
  const customer = await db.customer.findUnique({
    where: { id: link.customerId },
    include: { units: { where: { status: 'INSTALLED' }, include: { product: true } } },
  })
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.')
  const chosen = input.unitId ? customer.units.find((u) => u.id === input.unitId) : undefined
  const inverter = chosen ?? customer.units.find((u) => u.product.category === 'INVERTER') ?? customer.units[0]
  // FR-7.9: a per-model fault code carries its default priority
  let priority = 'NORMAL'
  if (input.faultCode && inverter) {
    const fc = await db.faultCode.findUnique({
      where: { productModel_code: { productModel: inverter.product.model ?? inverter.product.name, code: input.faultCode } },
    }).catch(() => null)
    if (fc) priority = fc.defaultPriority
  }
  const { openTicket } = await import('@/services/tickets')
  const ticket = await openTicket({
    customerId: customer.id,
    unitId: inverter?.id ?? null,
    channel: 'WEB',
    category: input.category,
    faultCode: input.faultCode ?? null,
    description: input.description,
    priority: priority as never,
    createdBy: null,
  })
  // FR-10.6: re-point the staged portal photo uploads to the real ticket
  const photoIds = (input.photoIds ?? []).slice(0, 4)
  if (photoIds.length > 0) {
    await db.attachment.updateMany({
      where: { id: { in: photoIds }, ownerType: 'TICKET', ownerId: { startsWith: 'pending:' }, uploadedBy: 'PORTAL' },
      data: { ownerId: ticket!.id },
    })
  }
  return ticket
}

/** FR-7.9: per-model fault codes for the customer's own units (portal ticket form) */
export async function portalFaultCodes(token: string) {
  const link = await verifyLink(token, 'PORTAL')
  const units = await db.inventoryUnit.findMany({
    where: { customerId: link.customerId, status: { in: ['DELIVERED', 'INSTALLED'] } },
    include: { product: true },
  })
  const models = [...new Set(units.map((u) => u.product.model ?? u.product.name))]
  const codes = models.length > 0
    ? await db.faultCode.findMany({ where: { productModel: { in: models } }, orderBy: { code: 'asc' } })
    : []
  return {
    units: units.map((u) => ({ id: u.id, label: u.product.name, model: u.product.model ?? u.product.name, serial: u.serialNumber })),
    codes: codes.map((c) => ({ code: c.code, model: c.productModel, description: c.description, defaultPriority: c.defaultPriority })),
  }
}

/** FR-10.8: full invoice document, gated behind the phone last-4 check */
export async function portalInvoice(token: string, invoiceNumber: string, last4: string) {
  const link = await verifyLink(token, 'PORTAL')
  await portalVerify(token, last4)
  const invoice = await db.invoice.findFirst({
    where: { invoiceNumber, customerId: link.customerId },
    include: { lines: true, order: { select: { orderNumber: true } }, customer: { select: { name: true } } },
  })
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found.')
  const settings = await getSettings()
  return {
    invoice: {
      invoiceNumber: invoice.invoiceNumber, type: invoice.type, issueDate: invoice.issueDate,
      dueDate: invoice.dueDate, subtotalPaise: invoice.subtotalPaise, taxPaise: invoice.taxPaise,
      totalPaise: invoice.totalPaise, status: invoice.status, orderNumber: invoice.order?.orderNumber ?? null,
      customerName: invoice.customer.name,
      lines: invoice.lines.map((l) => ({ description: l.description, qty: l.qty, unitPricePaise: l.unitPricePaise, lineTotalPaise: l.lineTotalPaise })),
    },
    branding: {
      companyName: settings.companyName, gstin: settings.gstin, address: settings.address,
      phone: settings.phone, email: settings.email, bankDetails: settings.bankDetails,
    },
  }
}

/** FR-10.5: warranty certificate document from the customer's own portal link */
export async function portalWarrantyDoc(token: string, warrantyId: string) {
  const link = await verifyLink(token, 'PORTAL')
  const w = await db.warranty.findFirst({
    where: { id: warrantyId, customerId: link.customerId },
    include: { unit: { include: { product: true } }, customer: { select: { name: true } } },
  })
  if (!w) throw new AppError('NOT_FOUND', 'Warranty not found.')
  const settings = await getSettings()
  return {
    warranty: {
      warrantyId: w.id, customerName: w.customer.name,
      productName: w.unit?.product.name ?? 'Equipment', serialNumber: w.unit?.serialNumber ?? '—',
      startDate: w.startDate, endDate: w.endDate, months: w.months,
      coverage: w.coverage, source: w.source, status: w.status,
    },
    branding: {
      companyName: settings.companyName, gstin: settings.gstin, address: settings.address,
      phone: settings.phone, email: settings.email, bankDetails: settings.bankDetails,
    },
  }
}

export async function portalTicketAction(token: string, ticketNumber: string, action: 'CONFIRM' | 'REOPEN', note?: string) {
  // P83: confirming or reopening a ticket needs the last-4 verification
  const { requirePortalVerified } = await import('@/lib/portal-verify')
  await requirePortalVerified(token)
  const link = await verifyLink(token, 'PORTAL')
  const customer = await db.customer.findUnique({ where: { id: link.customerId } })
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.')
  const ticket = await db.serviceTicket.findUnique({ where: { ticketNumber } })
  if (!ticket || ticket.customerId !== customer.id) throw new AppError('NOT_FOUND', 'Ticket not found.')
  const tickets = await import('@/services/tickets')
  if (action === 'CONFIRM') {
    if (ticket.status !== 'RESOLVED') throw new AppError('INVALID_TRANSITION', 'You can confirm the fix only after the technician marks the ticket resolved.')
    return tickets.confirmTicket(ticket.id, 'PORTAL', null)
  }
  return tickets.reopenTicket(ticket.id, note ?? '', null)
}

export async function portalQuoteView(token: string): Promise<{ quote: any; viaPortal: boolean }> {
  return publicQuoteByToken(token)
}
export async function portalAcceptQuote(token: string, name: string, idempotencyKey?: string) {
  return acceptQuote(token, name, idempotencyKey)
}
export async function portalRejectQuote(token: string, reason: string) {
  return rejectQuote(token, reason)
}

/** staff-side: issue a portal link for a customer and return the raw token */
export async function issuePortalLink(customerId: string, actorId: string) {
  const { token } = await issueLink(customerId, 'PORTAL', actorId, 90)
  const customer = await db.customer.findUnique({ where: { id: customerId } })
  const { enqueue } = await import('@/lib/outbox')
  await enqueue({
    channel: 'SMS',
    recipient: (customer?.phone ?? '').slice(0, 6) + 'XXXX' + (customer?.phone ?? '').slice(-3),
    template: 'PORTAL_LINK',
    payload: { to: customer?.phone, name: customer?.name, link: `/p/${token}` },
  })
  return token
}

/** certificate view by token (FR-6.6 shareable link). Accepts the certificate's
 *  own token, or the customer's portal token (used by the My SunPower page).
 *  viaPortal tells the UI to offer a "back to My SunPower" link. */
export async function certificateByToken(token: string) {
  const { sha256 } = await import('@/lib/auth')
  let viaPortal = false
  let installation = await db.installation.findFirst({
    where: { certificateTokenHash: sha256(token) },
    include: {
      order: { include: { customer: true, lines: { include: { product: true } } } },
      crew: { include: { technician: { include: { user: true } } } },
    },
  })
  if (!installation) {
    // fall back to a valid PORTAL link for the same customer
    const link = await db.customerAccessLink.findUnique({ where: { tokenHash: sha256(token) } })
    if (link && link.scope === 'PORTAL' && (!link.revokedAt) && link.expiresAt > new Date()) {
      viaPortal = true
      installation = await db.installation.findFirst({
        where: { order: { customerId: link.customerId }, status: 'COMPLETED' },
        orderBy: { scheduledOn: 'desc' },
        include: {
          order: { include: { customer: true, lines: { include: { product: true } } } },
          crew: { include: { technician: { include: { user: true } } } },
        },
      })
    }
  }
  if (!installation) throw new AppError('LINK_EXPIRED', 'This certificate link is not valid.')
  const units = await db.inventoryUnit.findMany({
    where: { installationId: installation.id },
    include: { product: true, warranties: true },
  })
  const settings = await import('@/lib/settings').then((m) => m.getSettings())
  return { installation, units, settings, viaPortal }
}

/** public warranty page (FR-5.9): product, serial, dates, days left — no customer data */
export async function publicWarrantyPage(code: string) {
  // a scanned/pasted label URL resolves to its code (FR-5.2)
  const normalized = parseScannedCode(code)
  const unit = await db.inventoryUnit.findFirst({
    where: { OR: [{ qrCode: normalized }, { serialNumber: normalized }] },
    include: { product: true, warranties: true },
  })
  if (!unit) throw new AppError('NOT_FOUND', 'No unit found for this code.')
  const active = unit.warranties.find((w) => w.status === 'ACTIVE')
  const today = istToday() // IST calendar date (D9)
  return {
    product: unit.product.name,
    brand: unit.product.brand,
    serial: unit.serialNumber,
    warranty: active
      ? {
          startDate: active.startDate,
          endDate: active.endDate,
          daysLeft: daysLeft(active),
          status: active.endDate >= today ? 'ACTIVE' : 'EXPIRED',
          months: active.months,
        }
      : null,
    unitStatus: unit.status,
  }
}
