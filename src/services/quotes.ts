// Quotes service (C3, FR-3.x): template quotes with an automatic parts list,
// five BOM quantity rules, margin warning (FR-3.8), discount approval (Q5),
// versioning, guarded send, and customer acceptance that creates the order.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { nextNumber } from '@/lib/ids'
import { audit, enqueue } from '@/lib/outbox'
import { getSettings } from '@/lib/settings'
import { generateBom, estimateMargin, BomProductInput, BomTemplateLine } from '@/domain/bom'
import { istToday } from '@/lib/dates'
import { withIdempotency } from '@/lib/idempotency'

/** system templates ARE the package: their capacity drives the BOM so a 5 kW
 *  inverter can never be quoted with 3 kW of panels (FR-3.1/FR-3.2). */
function templateCapacity(template: { systemType: string; capacityKw: number }, fallbacks: { assessment?: number | null; requested?: number | null }): number {
  if (template.systemType === 'ON_GRID' || template.systemType === 'OFF_GRID') {
    return template.capacityKw || fallbacks.assessment || fallbacks.requested || template.capacityKw
  }
  return fallbacks.assessment ?? fallbacks.requested ?? template.capacityKw
}

/** GST applies to the discounted amount: tax is scaled by the share of the
 *  subtotal that remains after the discount (FR-3.4). */
function taxOnDiscountedAmount(lineTaxPaise: number, subtotalPaise: number, discountPaise: number): number {
  if (subtotalPaise <= 0 || discountPaise <= 0) return lineTaxPaise
  const share = Math.max(0, 1 - discountPaise / subtotalPaise)
  return Math.round(lineTaxPaise * share)
}

export async function previewBom(templateCode: string, capacityKw: number, cableDistanceM?: number | null) {
  const template = await db.systemTemplate.findUnique({
    where: { code: templateCode },
    include: { bomLines: { include: { product: true } }, panelProduct: true },
  })
  if (!template || !template.isActive) throw new AppError('NOT_FOUND', 'Template not found.')
  const products = new Map<string, BomProductInput>()
  for (const bl of template.bomLines) products.set(bl.productId, toBomProduct(bl.product))
  if (template.panelProduct) products.set(template.panelProduct.id, toBomProduct(template.panelProduct))
  const result = generateBom(products, template.bomLines as BomTemplateLine[], {
    capacityKw,
    cableDistanceM,
    templateDefaultCableM: template.defaultCableDistanceM,
    panel: template.panelProduct ? toBomProduct(template.panelProduct) : null,
    requireInverter: template.systemType !== 'PANEL_SET',
  })
  const settings = await getSettings()
  const subtotal = result.lines.reduce((s, l) => s + l.lineTotalPaise, 0)
  const tax = result.lines.reduce((s, l) => s + l.lineTaxPaise, 0)
  const margin = estimateMargin(subtotal, 0, result.lines, template.labourAllowancePaise, settings.targetMarginBp)
  return {
    template: { code: template.code, name: template.name }, result, subtotalPaise: subtotal, taxPaise: tax,
    totalPaise: subtotal + tax, margin,
    subsidyEstimatePaise: template.systemType === 'ON_GRID' ? subsidyEstimateFor(capacityKw) : 0,
    discountLimitBp: settings.salesDiscountLimitBp,
  }
}

function toBomProduct(p: {
  id: string; name: string; sku: string; category: string; isSerialized: boolean; uom: string
  ratedPowerW: number | null; salePricePaise: number; stdCostPaise: number; taxRateBp: number
}): BomProductInput {
  return {
    id: p.id, name: p.name, sku: p.sku, category: p.category, isSerialized: p.isSerialized,
    uom: p.uom, ratedPowerW: p.ratedPowerW, salePricePaise: p.salePricePaise,
    stdCostPaise: p.stdCostPaise, taxRateBp: p.taxRateBp,
  }
}

export async function createQuote(input: {
  leadId: string
  templateCode: string
  discountPaise?: number
  actorId: string
  directorApproved?: boolean
}) {
  const lead = await db.lead.findUnique({ where: { id: input.leadId }, include: { surveys: true, assessments: true } })
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.')
  const settings = await getSettings()

  const template = await db.systemTemplate.findUnique({
    where: { code: input.templateCode },
    include: { bomLines: { include: { product: true } }, panelProduct: true },
  })
  if (!template) throw new AppError('NOT_FOUND', 'Template not found.')

  // the capacity comes from the chosen template for system packages (the BOM
  // must stay consistent); panel-set/service templates fall back to the
  // assessment recommendation, then the lead request
  const lastAssessment = lead.assessments[0]
  const capacityKw = templateCapacity(template, {
    assessment: lastAssessment?.recommendedKw ?? null,
    requested: lead.requestedCapacityKw ?? null,
  })
  const survey = lead.surveys.find((s) => s.status === 'APPROVED')

  const products = new Map<string, BomProductInput>()
  for (const bl of template.bomLines) products.set(bl.productId, toBomProduct(bl.product))
  if (template.panelProduct) products.set(template.panelProduct.id, toBomProduct(template.panelProduct))
  const bom = generateBom(products, template.bomLines as BomTemplateLine[], {
    capacityKw,
    cableDistanceM: survey?.cableDistanceM ?? null,
    templateDefaultCableM: template.defaultCableDistanceM,
    panel: template.panelProduct ? toBomProduct(template.panelProduct) : null,
    requireInverter: template.systemType !== 'PANEL_SET',
  })

  const subtotal = bom.lines.reduce((s, l) => s + l.lineTotalPaise, 0)
  const rawTax = bom.lines.reduce((s, l) => s + l.lineTaxPaise, 0)
  const discount = input.discountPaise ?? 0
  if (discount < 0 || discount > subtotal) throw new AppError('VALIDATION_FAILED', 'Discount must be between zero and the quote value.')
  // GST is charged on the discounted amount (FR-3.4)
  const tax = taxOnDiscountedAmount(rawTax, subtotal, discount)
  const discountLimitBp = settings.salesDiscountLimitBp
  // FR-3.4: over-limit discounts are allowed on a draft but cannot be sent until a
  // director approves them (sendQuote guards this; approve-discount endpoint sets it).
  const discountNeedsApproval = discount > Math.round((subtotal * discountLimitBp) / 10000)
  const margin = estimateMargin(subtotal, discount, bom.lines, template.labourAllowancePaise, settings.targetMarginBp)

  // indicative subsidy estimate (PM Surya Ghar style, illustrative)
  const subsidyEstimate = template.systemType === 'ON_GRID' ? subsidyEstimateFor(capacityKw) : 0

  const quoteNumber = await nextNumber('QUOTE', 'Q')
  const validUntil = (() => { const t = new Date(Date.now() + settings.quoteValidityDays * 86400000 + 330 * 60000); return t.toISOString().slice(0, 10) })()
  const version = (await db.quote.count({ where: { leadId: input.leadId } })) + 1

  const quote = await db.quote.create({
    data: {
      quoteNumber, leadId: input.leadId, customerId: lead.customerId, templateId: template.id,
      status: 'DRAFT', version, capacityKw, systemType: template.systemType,
      cableDistanceM: bom.usedCableDistanceM,
      subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax,
      totalPaise: subtotal - discount + tax,
      subsidyEstimatePaise: subsidyEstimate,
      estimatedMarginBp: margin.marginBp, marginWarning: margin.warning,
      validUntil,
    },
  })
  await db.quoteLine.createMany({
    data: bom.lines.map((l) => ({
      quoteId: quote.id, productId: l.productId, description: l.name, qty: l.qty,
      unitPricePaise: l.unitPricePaise, taxRateBp: l.taxRateBp, lineTotalPaise: l.lineTotalPaise,
      rule: l.rule,
    })),
  })
  if (bom.warnings.length > 0) {
    await db.leadActivity.create({ data: { leadId: input.leadId, type: 'SYSTEM', body: bom.warnings.join(' '), actorId: input.actorId } })
  }
  await db.leadActivity.create({
    data: { leadId: input.leadId, type: 'SYSTEM', body: `Quote ${quoteNumber} v${version} drafted from template ${template.code}: ${bom.lines.length} lines, ${bom.panelCount} panels.${discountNeedsApproval ? ' Discount above the sales limit — director approval required before sending.' : ''}`, actorId: input.actorId },
  })
  await audit({ actorType: 'USER', actorId: input.actorId, entityType: 'quote', entityId: quote.id, action: 'create', after: { quoteNumber, marginBp: margin.marginBp, warning: margin.warning } })
  return db.quote.findUnique({ where: { id: quote.id }, include: { lines: { include: { product: true } } } })
}

export function subsidyEstimateFor(kw: number): number {
  // indicative central + state assistance for residential rooftop (illustrative seed values)
  if (kw <= 2) return 60000 * 100
  if (kw <= 3) return 78000 * 100
  return 78000 * 100 // capped above 3 kW in this illustrative model
}

/** FR-3.4: director approval for an over-limit discount, before the quote can be sent. */
export async function approveDiscount(quoteId: string, actorId: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lead: true } })
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.')
  if (!['DRAFT', 'SENT', 'REJECTED'].includes(quote.status)) {
    throw new AppError('INVALID_TRANSITION', 'Only draft, sent or rejected quotes can have their discount approved.')
  }
  const settings = await getSettings()
  const limit = Math.round((quote.subtotalPaise * settings.salesDiscountLimitBp) / 10000)
  if (quote.discountPaise <= limit) {
    throw new AppError('VALIDATION_FAILED', 'This discount is within the sales limit — no approval needed.')
  }
  await db.quote.update({ where: { id: quoteId }, data: { discountApprovedBy: actorId } })
  await db.leadActivity.create({
    data: { leadId: quote.leadId, type: 'SYSTEM', body: `Discount of ${moneyRs(quote.discountPaise)} on ${quote.quoteNumber} approved by the director.`, actorId },
  })
  await audit({ actorType: 'USER', actorId, entityType: 'quote', entityId: quoteId, action: 'discount_approve', after: { discountPaise: quote.discountPaise } })
  return { ok: true }
}

function moneyRs(paise: number): string {
  return `Rs ${(paise / 100).toLocaleString('en-IN')}`
}

export async function sendQuote(quoteId: string, actorId: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lead: { include: { customer: true, surveys: true } }, lines: true } })
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.')
  if (quote.status !== 'DRAFT') throw new AppError('INVALID_TRANSITION', 'Only draft quotes can be sent.')
  if (quote.totalPaise <= 0) throw new AppError('VALIDATION_FAILED', 'Quote total must be above zero.')
  const approvedSurvey = quote.lead.surveys.some((s) => s.status === 'APPROVED')
  if (!approvedSurvey) throw new AppError('SURVEY_NOT_APPROVED', 'The survey must be approved before a quote can be sent.')

  const settings = await getSettings()
  const discountLimit = Math.round((quote.subtotalPaise * settings.salesDiscountLimitBp) / 10000)
  if (quote.discountPaise > discountLimit && !quote.discountApprovedBy) {
    throw new AppError('DISCOUNT_NEEDS_APPROVAL', `The discount is above the ${settings.salesDiscountLimitBp / 100}% sales limit — director approval is required before sending.`)
  }
  const { issueLink } = await import('@/lib/access-links')
  const { sha256 } = await import('@/lib/auth')
  const token = (await issueLink(quote.lead.customerId, 'QUOTE', actorId, settings.quoteValidityDays + 30)).token

  await db.quote.update({ where: { id: quoteId }, data: { status: 'SENT', sentAt: new Date(), publicTokenHash: sha256(token) } })
  // supersede older versions still in flight
  await db.quote.updateMany({
    where: { leadId: quote.leadId, status: 'SENT', id: { not: quoteId } },
    data: { status: 'SUPERSEDED' },
  })
  await db.lead.update({ where: { id: quote.leadId }, data: { status: 'QUOTED' } })
  await db.leadActivity.create({
    data: { leadId: quote.leadId, type: 'SYSTEM', body: `Quote ${quote.quoteNumber} sent to the customer with a secure link valid until ${quote.validUntil}.`, actorId },
  })
  await enqueue({
    channel: 'SMS',
    recipient: quote.lead.customer.phone.slice(0, 6) + 'XXXX' + quote.lead.customer.phone.slice(-3),
    template: 'QUOTE_SENT',
    payload: { to: quote.lead.customer.phone, name: quote.lead.customer.name, quoteNumber: quote.quoteNumber, total: quote.totalPaise, link: `/q/${token}`, validUntil: quote.validUntil },
  })
  await audit({ actorType: 'USER', actorId, entityType: 'quote', entityId: quoteId, action: 'send' })
  return { quoteId, token }
}

export async function reviseQuote(quoteId: string, actorId: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lines: true, lead: true } })
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.')
  if (!['SENT', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
    throw new AppError('INVALID_TRANSITION', 'Only sent, rejected or expired quotes can be revised.')
  }
  await db.quote.update({ where: { id: quoteId }, data: { status: 'SUPERSEDED' } })
  // a revision keeps the negotiated discount — it is not silently dropped
  const created = await createQuote({ leadId: quote.leadId, templateCode: (await db.systemTemplate.findUnique({ where: { id: quote.templateId } }))!.code, discountPaise: quote.discountPaise, actorId })
  await db.quote.update({ where: { id: created!.id }, data: { version: quote.version + 1, supersedesId: quoteId } })
  // an approved over-limit discount stays approved across the revision when the
  // new subtotal still needs it
  if (quote.discountApprovedBy && created!.discountPaise > 0) {
    const settings = await getSettings()
    const limit = Math.round((created!.subtotalPaise * settings.salesDiscountLimitBp) / 10000)
    if (created!.discountPaise > limit) {
      await db.quote.update({ where: { id: created!.id }, data: { discountApprovedBy: quote.discountApprovedBy } })
    }
  }
  await db.leadActivity.create({
    data: { leadId: quote.leadId, type: 'SYSTEM', body: `Quote ${quote.quoteNumber} superseded by revision v${quote.version + 1}${quote.discountPaise > 0 ? ` (discount of ${moneyRs(quote.discountPaise)} carried over)` : ''}.`, actorId },
  })
  return created
}

export async function publicQuoteByToken(token: string): Promise<{ quote: any; viaPortal: boolean }> {
  const { quote, viaPortal } = await resolveQuoteForToken(token)
  if (!quote) throw new AppError('LINK_EXPIRED', 'This quote link is not valid.')
  if (quote.status === 'SUPERSEDED') throw new AppError('LINK_EXPIRED', 'This quote has a newer revision. Please ask SunPower for the fresh link.')
  return { quote, viaPortal }
}

/** The My SunPower portal's "Open quotation" button navigates with the PORTAL
 *  token, while the SMS link carries the quote's own token — both must work.
 *  Resolution order: quote-by-hash first, then (for a live PORTAL link) the
 *  customer's current quote: the SENT one, else the newest version. */
async function resolveQuoteForToken(token: string): Promise<{ quote: any | null; viaPortal: boolean }> {
  const { sha256 } = await import('@/lib/auth')
  const byHash = await db.quote.findUnique({
    where: { publicTokenHash: sha256(token) },
    include: { lines: { include: { product: true } }, lead: { include: { customer: true, assessments: true } } },
  })
  if (byHash) return { quote: byHash, viaPortal: false }
  const link = await db.customerAccessLink.findUnique({ where: { tokenHash: sha256(token) } })
  if (link && link.scope === 'PORTAL' && !link.revokedAt && link.expiresAt > new Date()) {
    // a customer may have several enquiry leads over the years — look for the
    // best quote across ALL of them: a SENT one (action needed) wins, else the
    // newest non-superseded quote (e.g. the one they already accepted)
    const leads = await db.lead.findMany({ where: { customerId: link.customerId }, select: { id: true } })
    if (leads.length > 0) {
      const quotes = await db.quote.findMany({
        where: { leadId: { in: leads.map((l) => l.id) } },
        orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
        include: { lines: { include: { product: true } }, lead: { include: { customer: true, assessments: true } } },
      })
      const live = quotes.find((q) => q.status === 'SENT') ?? quotes.find((q) => q.status !== 'SUPERSEDED') ?? null
      if (live) return { quote: live, viaPortal: true }
    }
  }
  return { quote: null, viaPortal: false }
}

export async function acceptQuote(token: string, acceptedName: string, idempotencyKey?: string) {
  // D16 + P83: acceptance is idempotent and needs the last-4 verification
  if (!idempotencyKey) return acceptQuoteOnce(token, acceptedName)
  return withIdempotency('quote.accept', `${token.slice(0, 24)}:${idempotencyKey}`, () => acceptQuoteOnce(token, acceptedName))
}

async function acceptQuoteOnce(token: string, acceptedName: string) {
  const { requirePortalVerified } = await import('@/lib/portal-verify')
  // verification binds to the token the customer is browsing with — the SMS
  // quote token or the My SunPower portal token both carry the same last-4 check
  await requirePortalVerified(token)
  const { quote } = await resolveQuoteForToken(token)
  if (!quote) throw new AppError('LINK_EXPIRED', 'This quote link is not valid.')
  if (quote.status !== 'SENT') throw new AppError('INVALID_TRANSITION', 'This quote can no longer be accepted.')
  if (quote.validUntil && quote.validUntil < istToday()) {
    await db.quote.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } })
    throw new AppError('INVALID_TRANSITION', 'This quote has expired. Ask SunPower for a revision.')
  }

  const order = await createOrderFromQuote(quote.id)
  await db.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedName } })
  await db.lead.update({ where: { id: quote.leadId }, data: { status: 'WON' } })
  await db.leadActivity.create({
    data: { leadId: quote.leadId, type: 'SYSTEM', body: `Customer accepted quote ${quote.quoteNumber} online (signed as "${acceptedName}"). Order ${order.orderNumber} created.`, actorId: null },
  })
  await enqueue({
    channel: 'SMS',
    recipient: quote.lead.customer.phone.slice(0, 6) + 'XXXX' + quote.lead.customer.phone.slice(-3),
    template: 'QUOTE_ACCEPTED',
    payload: { to: quote.lead.customer.phone, name: quote.lead.customer.name, quoteNumber: quote.quoteNumber, orderNumber: order.orderNumber, advance: order.advanceRequiredPaise },
  })
  await audit({ actorType: 'CUSTOMER', entityType: 'quote', entityId: quote.id, action: 'accept', after: { acceptedName } })
  return order
}

/** offline acceptance (T45R25): sales records an acceptance taken by phone or
 *  in person on behalf of the customer, with an audit trail naming the staff. */
export async function acceptQuoteOffline(quoteId: string, acceptedName: string, note: string | null, actorId: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lead: { include: { customer: true } }, lines: true } })
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.')
  if (quote.status !== 'SENT') throw new AppError('INVALID_TRANSITION', 'Only a sent quote can be accepted.')
  if (quote.validUntil && quote.validUntil < istToday()) {
    throw new AppError('INVALID_TRANSITION', 'This quote has expired. Revise it before recording an acceptance.')
  }
  const actor = await db.user.findUnique({ where: { id: actorId } })
  const order = await createOrderFromQuote(quote.id)
  await db.quote.update({
    where: { id: quote.id },
    data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedName, acceptedOfflineBy: actorId },
  })
  await db.lead.update({ where: { id: quote.leadId }, data: { status: 'WON' } })
  await db.leadActivity.create({
    data: { leadId: quote.leadId, type: 'SYSTEM', body: `Acceptance of quote ${quote.quoteNumber} recorded offline by ${actor?.name ?? 'staff'} — customer signed as "${acceptedName}"${note ? ` (note: ${note})` : ''}. Order ${order.orderNumber} created.`, actorId },
  })
  await enqueue({
    channel: 'SMS',
    recipient: quote.lead.customer.phone.slice(0, 6) + 'XXXX' + quote.lead.customer.phone.slice(-3),
    template: 'QUOTE_ACCEPTED',
    payload: { to: quote.lead.customer.phone, name: quote.lead.customer.name, quoteNumber: quote.quoteNumber, orderNumber: order.orderNumber, advance: order.advanceRequiredPaise },
  })
  await audit({ actorType: 'USER', actorId, entityType: 'quote', entityId: quote.id, action: 'accept_offline', after: { acceptedName, note } })
  return order
}

/** manual quote-line edit (FR-3.x): a draft quote's lines can be adjusted by
 *  sales (qty/price/add/remove); totals, GST and the margin warning recompute. */
export async function updateQuoteLines(
  quoteId: string,
  lines: { productId: string; description: string; qty: number; unitPricePaise: number; taxRateBp?: number }[],
  actorId: string
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lines: true, lead: { include: { customer: true } } } })
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.')
  if (quote.status !== 'DRAFT') throw new AppError('INVALID_TRANSITION', 'Only the lines of a draft quote can be edited.')
  if (lines.length === 0) throw new AppError('VALIDATION_FAILED', 'A quote needs at least one line.')
  for (const l of lines) {
    if (l.qty <= 0 || l.unitPricePaise < 0 || !l.description?.trim()) {
      throw new AppError('VALIDATION_FAILED', 'Every line needs a description, a quantity above zero and a non-negative price.')
    }
  }
  const products = await db.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } })
  if (products.length !== new Set(lines.map((l) => l.productId)).size) {
    throw new AppError('VALIDATION_FAILED', 'Every line must reference a product from the catalogue.')
  }
  const template = quote.templateId ? await db.systemTemplate.findUnique({ where: { id: quote.templateId }, include: { bomLines: { include: { product: true } } } }) : null
  const costById = new Map<string, number>()
  for (const l of template?.bomLines ?? []) costById.set(l.productId, l.product.stdCostPaise)
  for (const p of products) if (!costById.has(p.id)) costById.set(p.id, p.stdCostPaise)

  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPricePaise), 0)
  const rawTax = lines.reduce((s, l) => s + Math.round((l.qty * l.unitPricePaise * (l.taxRateBp ?? 0)) / 10000), 0)
  const discount = Math.min(quote.discountPaise, subtotal) // keep the discount, clamp if the shrunken subtotal no longer covers it
  const tax = taxOnDiscountedAmount(rawTax, subtotal, discount)
  const settings = await getSettings()
  const margin = estimateMargin(subtotal, discount, lines.map((l) => ({ lineCostPaise: Math.round(l.qty * (costById.get(l.productId) ?? 0)) })), template?.labourAllowancePaise ?? 0, settings.targetMarginBp)

  await db.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { quoteId } })
    await tx.quoteLine.createMany({
      data: lines.map((l) => ({
        quoteId, productId: l.productId, description: l.description.trim(), qty: l.qty,
        unitPricePaise: l.unitPricePaise, taxRateBp: l.taxRateBp ?? 0,
        lineTotalPaise: Math.round(l.qty * l.unitPricePaise), rule: 'MANUAL', isManual: true,
      })),
    })
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax, totalPaise: subtotal - discount + tax,
        estimatedMarginBp: margin.marginBp, marginWarning: margin.warning,
      },
    })
    await tx.leadActivity.create({
      data: { leadId: quote.leadId, type: 'SYSTEM', body: `Lines of quote ${quote.quoteNumber} edited manually (${lines.length} lines, new total ${moneyRs(subtotal - discount + tax)}).`, actorId },
    })
    await audit({ actorType: 'USER', actorId, entityType: 'quote', entityId: quoteId, action: 'edit_lines', before: { lines: quote.lines.length, totalPaise: quote.totalPaise }, after: { lines: lines.length, totalPaise: subtotal - discount + tax } }, tx)
  })
  return db.quote.findUnique({ where: { id: quoteId }, include: { lines: { include: { product: true } } } })
}

export async function rejectQuote(token: string, reason: string) {
  const { requirePortalVerified } = await import('@/lib/portal-verify')
  await requirePortalVerified(token)
  const { quote } = await resolveQuoteForToken(token)
  if (!quote) throw new AppError('LINK_EXPIRED', 'This quote link is not valid.')
  if (quote.status !== 'SENT') throw new AppError('INVALID_TRANSITION', 'This quote can no longer be rejected.')
  await db.quote.update({ where: { id: quote.id }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: reason } })
  // lead stays QUOTED so sales can revise (FR-10.2)
  await db.leadActivity.create({
    data: { leadId: quote.leadId, type: 'SYSTEM', body: `Customer rejected quote ${quote.quoteNumber}: "${reason}". Lead stays with sales for a revision.`, actorId: null },
  })
  const salesEmail = (await db.user.findFirst({ where: { role: 'SALES', isActive: true } }))?.email ?? 'sales@sunpower.example'
  await enqueue({ channel: 'EMAIL', recipient: salesEmail, template: 'QUOTE_REJECTED', payload: { quoteNumber: quote.quoteNumber, reason } })
  await audit({ actorType: 'CUSTOMER', entityType: 'quote', entityId: quote.id, action: 'reject', after: { reason } })
  return { ok: true }
}

async function createOrderFromQuote(quoteId: string) {
  const quote = (await db.quote.findUnique({ where: { id: quoteId }, include: { lines: true, lead: { include: { customer: true, surveys: true } } } }))!
  const settings = await getSettings()
  const orderNumber = await nextNumber('ORDER', 'SO')
  const advance = Math.round(((quote.totalPaise) * settings.advancePct) / 100)
  // quote flip, order, lines and subsidy application commit atomically (D1)
  const order = await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber, quoteId: quote.id, customerId: quote.customerId, status: 'PENDING_ADVANCE',
        capacityKw: quote.capacityKw, systemType: quote.systemType,
        siteSnapshot: JSON.stringify({
          address: quote.lead.customer.addressLine, city: quote.lead.customer.city, pincode: quote.lead.customer.pincode,
          cableDistanceM: quote.cableDistanceM,
        }),
        subtotalPaise: quote.subtotalPaise, discountPaise: quote.discountPaise, taxPaise: quote.taxPaise,
        totalPaise: quote.totalPaise, advanceRequiredPaise: advance,
      },
    })
    await tx.orderLine.createMany({
      data: quote.lines.map((l) => ({
        orderId: order.id, productId: l.productId, description: l.description, qty: l.qty,
        unitPricePaise: l.unitPricePaise, taxRateBp: l.taxRateBp,
      })),
    })
    await tx.subsidyApplication.create({
      data: { orderId: order.id, status: quote.lead.wantsSubsidy ? 'PREPARING' : 'NOT_STARTED', expectedPaise: quote.subsidyEstimatePaise },
    })
    return order
  })
  return order
}

export async function quoteDetail(quoteId: string) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { lines: { include: { product: true } }, lead: { include: { customer: true, assessments: true } } },
  })
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.')
  const settings = await getSettings()
  const discountLimit = Math.round((quote.subtotalPaise * settings.salesDiscountLimitBp) / 10000)
  const a = quote.lead?.assessments?.[0] ?? null
  return {
    quote,
    discountNeedsApproval: quote.discountPaise > discountLimit && !quote.discountApprovedBy,
    discountLimitPaise: discountLimit,
    savings: a
      ? { annualGenerationKwh: a.annualGenerationKwh, annualSavingsPaise: a.annualSavingsPaise, paybackYears: a.paybackYears, recommendedKw: a.recommendedKw }
      : null,
    branding: {
      companyName: settings.companyName, gstin: settings.gstin, address: settings.address,
      phone: settings.phone, email: settings.email, bankDetails: settings.bankDetails,
    },
  }
}

export async function listQuotes() {
  return db.quote.findMany({
    include: { lead: { include: { customer: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

/** FR-3.7: cron job that proactively flips sent-but-expired quotes to EXPIRED. */
export async function expireStaleQuotes() {
  const today = istToday()
  const stale = await db.quote.findMany({
    where: { status: 'SENT', validUntil: { lt: today } },
    include: { lead: true },
  })
  let expired = 0
  for (const q of stale) {
    await db.quote.update({ where: { id: q.id }, data: { status: 'EXPIRED' } })
    await db.leadActivity.create({
      data: { leadId: q.leadId, type: 'SYSTEM', body: `Quote ${q.quoteNumber} expired on ${q.validUntil}. Ask sales for a revision with current prices.`, actorId: null },
    })
    await audit({ actorType: 'SYSTEM', entityType: 'quote', entityId: q.id, action: 'expire', after: { validUntil: q.validUntil } })
    expired++
  }
  return { expired }
}
