// Leads service (CRM module): enquiry capture that can never lose a lead (C1),
// round-robin assignment, 4-business-hour SLA, duplicate detection (FR-1.4),
// qualification and transitions.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { nextNumber } from '@/lib/ids'
import { enqueue, audit } from '@/lib/outbox'
import { LEAD_TRANSITIONS, LeadStatus } from '@/domain/state-machines'
import { getSettings } from '@/lib/settings'
import { addBusinessHours } from '@/lib/dates'

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits
  if (digits.length === 10) return '+91' + digits
  if (raw.startsWith('+')) return '+' + digits
  return '+' + digits
}

export function normalizeAddress(s: string): string {
  return s.toLowerCase().replace(/[.,\/#?!$%\^&\*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** trigram-ish similarity: character bigram Jaccard (pragmatic stand-in for pg_trgm) */
export function addressSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const A = bigrams(a), B = bigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

export interface EnquiryInput {
  name: string
  phone: string
  email?: string | null
  addressLine: string
  city: string
  pincode: string
  requestedCapacityKw?: number | null
  systemTypePref?: string | null
  wantsSubsidy?: boolean
  monthlyBillPaise?: number | null
  /** optional free-text from the public form (e.g. AI bill-scan estimate) */
  notes?: string
  consent: boolean
  source: 'WEB_FORM' | 'WHATSAPP' | 'PHONE' | 'WALK_IN' | 'REFERRAL'
  actorId?: string | null
  honeypot?: string
}

export async function createLeadFromEnquiry(input: EnquiryInput, opts: { requestId: string }) {
  if (input.honeypot) throw new AppError('VALIDATION_FAILED', 'Submission rejected.')
  if (!input.consent) throw new AppError('VALIDATION_FAILED', 'Consent is required to contact you.')
  const settings = await getSettings()
  const phone = normalizePhone(input.phone)
  const email = input.email ? input.email.trim().toLowerCase() : null

  // duplicate detection (FR-1.4)
  let customer = await db.customer.findUnique({ where: { phone } })
  const isNewCustomer = !customer
  if (!customer) {
    const cnum = await nextNumber('CUSTOMER', 'C')
    customer = await db.customer.create({
      data: {
        customerNumber: cnum,
        name: input.name,
        phone,
        email,
        addressLine: input.addressLine,
        addressNorm: normalizeAddress(`${input.addressLine} ${input.pincode}`),
        city: input.city,
        pincode: input.pincode,
        consentAt: new Date(),
      },
    })
  } else if (email && !customer.email) {
    customer = await db.customer.update({
      where: { id: customer.id },
      data: { email },
    })
  }

  // round-robin to active sales users (FR-1.3)
  const salesUsers = await db.user.findMany({ where: { role: 'SALES', isActive: true }, orderBy: { createdAt: 'asc' } })
  if (salesUsers.length === 0) throw new AppError('INTERNAL', 'No active sales user to assign.')
  const openCounts = await db.lead.groupBy({ by: ['ownerId'], where: { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'SURVEY_APPROVED', 'QUOTED'] } }, _count: { _all: true } })
  const counts = new Map(openCounts.map((c) => [c.ownerId, c._count._all]))
  const owner = salesUsers.sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0]

  const leadNumber = await nextNumber('LEAD', 'L')
  // FR-1.6: the first-contact SLA runs on the business calendar (4 business hours)
  const slaDueAt = addBusinessHours(new Date(), 4, {
    businessDays: settings.businessDays,
    businessStartHour: settings.businessStartHour,
    businessEndHour: settings.businessEndHour,
  })
  const lead = await db.lead.create({
    data: {
      leadNumber,
      customerId: customer.id,
      source: input.source,
      status: 'NEW',
      ownerId: owner.id,
      requestedCapacityKw: input.requestedCapacityKw ?? null,
      systemTypePref: input.systemTypePref ?? null,
      wantsSubsidy: input.wantsSubsidy ?? false,
      monthlyBillPaise: input.monthlyBillPaise ?? null,
      tariffPaise: settings.defaultTariffPaise,
      slaDueAt,
    },
  })

  await db.leadActivity.create({
    data: { leadId: lead.id, type: 'SYSTEM', body: `Enquiry received via ${input.source.replace('_', ' ').toLowerCase()} and assigned to ${owner.name}. Reference ${leadNumber}.`, actorId: null },
  })

  // free-text from the form (e.g. the AI bill-scan line) → NOTE activity
  const note = input.notes?.trim()
  if (note) {
    await db.leadActivity.create({
      data: { leadId: lead.id, type: 'NOTE', body: note.slice(0, 600), actorId: null },
    })
  }

  // address duplicate flag (never auto-merge)
  const flags: { reason: string; score: number; customerId: string }[] = []
  const others = await db.customer.findMany({
    where: { id: { not: customer.id }, pincode: input.pincode },
    take: 200,
  })
  for (const o of others) {
    const score = addressSimilarity(customer.addressNorm, o.addressNorm)
    if (score >= settings.duplicateAddressThreshold) flags.push({ reason: 'ADDRESS', score, customerId: o.id })
  }
  for (const f of flags) {
    await db.leadDuplicateFlag.create({
      data: { leadId: lead.id, matchedCustomerId: f.customerId, reason: f.reason, score: Math.round(f.score * 100) / 100 },
    })
  }

  // portal link + welcome message (A10, D11). P27 "one persistent page":
  // an existing customer's active link is RE-SENT, never replaced, and the raw
  // token is never handed to an anonymous caller who quoted an existing
  // customer's phone — only a brand-new customer sees their link inline.
  const { issueLink } = await import('@/lib/access-links')
  const { token, reused } = await issueLink(customer.id, 'PORTAL', null, 90)
  const { runOutbox } = await import('@/lib/outbox')

  // Send email if customer has an email address
  const recipientEmail = email ?? customer.email
  if (recipientEmail) {
    await enqueue({
      channel: 'EMAIL',
      recipient: recipientEmail,
      template: reused ? 'PORTAL_LINK_RESENT' : 'PORTAL_LINK',
      payload: { to: recipientEmail, name: customer.name, leadNumber, link: `/p/${token}` },
    })
  }

  await enqueue({
    channel: 'SMS',
    recipient: maskPhone(customer.phone),
    template: reused ? 'PORTAL_LINK_RESENT' : 'PORTAL_LINK',
    payload: { to: customer.phone, name: customer.name, leadNumber, link: `/p/${token}` },
  })

  // Deliver queued messages immediately
  void runOutbox()

  await audit({ actorType: input.actorId ? 'USER' : 'SYSTEM', actorId: input.actorId, entityType: 'lead', entityId: lead.id, action: 'create', after: { leadNumber, source: input.source } })

  return { lead, customer, isNewCustomer, duplicateFlags: flags.length, portalToken: token }
}

export function maskPhone(phone: string): string {
  return phone.slice(0, 6) + 'XXXX' + phone.slice(-3)
}

export async function leadDetail(leadId: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      customer: true,
      activities: { orderBy: { createdAt: 'desc' } },
      duplicateFlags: { include: { lead: { include: { customer: true } } } },
      surveys: { orderBy: { scheduledAt: 'desc' } },
      assessments: { orderBy: { createdAt: 'desc' } },
      quotes: { orderBy: { version: 'desc' } },
    },
  })
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.')
  return lead
}

export async function updateQualification(leadId: string, patch: {
  roofAreaSqm?: number | null
  monthlyBillPaise?: number | null
  monthlyUnits?: number | null
  gridOk?: boolean | null
  sanctionedLoadKw?: number | null
  phase?: string | null
  tariffPaise?: number | null
  requestedCapacityKw?: number | null
  systemTypePref?: string | null
  wantsSubsidy?: boolean | null
}, actorId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId } })
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.')
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) data[k] = v
  }
  const updated = await db.lead.update({ where: { id: leadId }, data })
  await db.leadActivity.create({ data: { leadId, type: 'NOTE', body: 'Qualification details updated.', actorId } })
  return updated
}

export async function transitionLead(leadId: string, to: LeadStatus, actorId: string, opts: { reason?: string; note?: string }) {
  const lead = await db.lead.findUnique({ where: { id: leadId } })
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(LEAD_TRANSITIONS, lead.status as LeadStatus, to, 'This lead')

  if (to === 'QUALIFIED') {
    const complete = lead.roofAreaSqm != null && (lead.monthlyBillPaise != null || lead.monthlyUnits != null) && lead.gridOk != null
    if (!complete) throw new AppError('VALIDATION_FAILED', 'Complete the call checklist first: shadow-free roof area, monthly bill or units, and grid suitability.')
  }
  if ((to === 'LOST' || to === 'DISQUALIFIED') && !opts.reason) {
    throw new AppError('VALIDATION_FAILED', 'A reason is required to close a lead.')
  }

  const data: Record<string, unknown> = { status: to }
  if (to === 'CONTACTED') data.firstContactedAt = new Date()
  if (to === 'LOST' || to === 'DISQUALIFIED') data.lostReason = opts.reason

  const updated = await db.lead.update({ where: { id: leadId }, data })
  await db.leadActivity.create({
    data: { leadId, type: 'STATUS_CHANGE', body: `Status changed ${lead.status} -> ${to}${opts.reason ? `: ${opts.reason}` : ''}${opts.note ? `. ${opts.note}` : ''}`, actorId },
  })
  await audit({ actorType: 'USER', actorId, entityType: 'lead', entityId: leadId, action: 'transition', before: { status: lead.status }, after: { status: to, reason: opts.reason } })
  return updated
}

export async function resolveDuplicate(leadId: string, flagId: string, action: 'LINKED' | 'DISMISSED', actorId: string) {
  const flag = await db.leadDuplicateFlag.findUnique({ where: { id: flagId } })
  if (!flag || flag.leadId !== leadId) throw new AppError('NOT_FOUND', 'Duplicate flag not found.')
  await db.leadDuplicateFlag.update({ where: { id: flagId }, data: { status: action, resolvedBy: actorId } })
  await db.leadActivity.create({
    data: { leadId, type: 'NOTE', body: action === 'LINKED' ? 'Duplicate flag linked to the existing customer record.' : 'Duplicate flag dismissed; kept as a separate customer.', actorId },
  })
  await audit({ actorType: 'USER', actorId, entityType: 'lead_duplicate_flag', entityId: flagId, action, after: { action } })
}

export async function listLeads(filter: { status?: string; ownerId?: string; q?: string }) {
  const where: Record<string, unknown> = {}
  if (filter.status) where.status = filter.status
  if (filter.ownerId) where.ownerId = filter.ownerId
  if (filter.q) {
    const digits = filter.q.replace(/\D/g, '')
    where.OR = [
      { leadNumber: { contains: filter.q } },
      { customer: { name: { contains: filter.q } } },
      ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits } } }] : []),
    ]
  }
  const rows = await db.lead.findMany({
    where,
    include: { customer: true, duplicateFlags: { where: { status: 'OPEN' } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  // FR-1.3: the board's owner chips come from the real sales roster
  const owners = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ownerId))] } } })
  const nameById = new Map(owners.map((o) => [o.id, o.name]))
  return rows.map((r) => ({ ...r, ownerName: nameById.get(r.ownerId) ?? null }))
}

/**
 * Automation 8 / FR-1.6: daily-ish sweep that flags leads uncontacted past
 * their 4-business-hour SLA and notifies the owner through the outbox.
 * Deduped: one notification per lead (marked via a lead activity row).
 */
export async function runLeadSlaSweep() {
  const open = await db.lead.findMany({
    where: { status: { in: ['NEW', 'CONTACTED'] }, firstContactedAt: null, slaDueAt: { lt: new Date() } },
    include: { customer: true },
  })
  let notified = 0
  for (const l of open) {
    const already = await db.leadActivity.count({ where: { leadId: l.id, body: { contains: 'SLA breach' } } })
    if (already > 0) continue
    const owner = await db.user.findUnique({ where: { id: l.ownerId } })
    await db.leadActivity.create({
      data: { leadId: l.id, type: 'SYSTEM', body: `SLA breach — enquiry not contacted within 4 business hours (due ${l.slaDueAt.toISOString()}). Owner notified.`, actorId: null },
    })
    await enqueue({
      channel: 'EMAIL',
      recipient: owner?.email ?? 'sales@sunpower.example',
      template: 'LEAD_SLA_BREACH',
      payload: { leadNumber: l.leadNumber, customer: l.customer.name, phone: l.customer.phone, owner: owner?.name ?? 'sales' },
    })
    await audit({ actorType: 'SYSTEM', entityType: 'lead', entityId: l.id, action: 'sla_breach', after: { slaDueAt: l.slaDueAt.toISOString() } })
    notified++
  }
  return { breached: open.length, notified }
}
