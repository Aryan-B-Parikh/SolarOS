// Email template rendering for the outbox (D15). Every template name that
// services enqueue() has a renderer here; renderEmail returns null for
// unknown names so the sender can park the message instead of guessing.
// Branded, minimal, inline-styled HTML that renders fine in every client.

const BASE_URL = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

// ── small helpers ─────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** defensive string from an unknown payload field */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** paise (integer) → "₹1,23,456.78" (two decimals only when there is a fraction) */
function inr(paise: unknown): string {
  const n = Number(paise)
  if (!Number.isFinite(n)) return '₹0'
  const rupees = n / 100
  const frac = Math.abs(rupees) % 1 !== 0
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`
}

/** human date for "YYYY-MM-DD" or ISO datetime strings; falls back to raw */
function fmtDate(v: unknown): string {
  const s = str(v)
  if (!s) return '—'
  const t = new Date(s.length === 10 ? `${s}T00:00:00+05:30` : s)
  if (isNaN(t.getTime())) return s
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const ist = new Date(t.getTime() + 330 * 60000)
  const date = `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`
  if (s.length === 10) return date
  let h = ist.getUTCHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${date}, ${h}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${ampm} IST`
}

function slotLabel(v: unknown): string {
  const s = str(v)
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function absLink(path: unknown): string {
  const s = str(path)
  if (!s) return ''
  return /^https?:\/\//.test(s) ? s : `${BASE_URL}${s.startsWith('/') ? '' : '/'}${s}`
}

function link(text: string, path: unknown): string {
  const url = absLink(path)
  if (!url) return ''
  return `<p style="margin: 18px 0 6px;"><a href="${esc(url)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600;">${esc(text)}</a></p><p style="margin: 4px 0 0; font-size: 12px; color: #64748b; word-break: break-all;">${esc(url)}</p>`
}

function row(label: string, value: string): string {
  return `<p style="margin: 4px 0;"><strong style="color: #0f172a;">${esc(label)}:</strong> ${esc(value)}</p>`
}

function para(text: string): string {
  return `<p style="margin: 0 0 8px;">${esc(text)}</p>`
}

function greeting(name: unknown): string {
  const n = str(name)
  return para(`Hi ${n || 'there'},`)
}

// ── branded layout ────────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="margin: 0; padding: 24px; background: #f1f5f9;">
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
  <div style="background: #f59e0b; padding: 16px 24px;">
    <span style="font-size: 18px; font-weight: 700; color: #1e293b;">&#9728;&#65039; SunPower Solar</span>
  </div>
  <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.65;">
    <h2 style="margin: 0 0 14px; font-size: 17px; color: #0f172a;">${esc(title)}</h2>
    ${body}
  </div>
  <div style="padding: 14px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px;">
    SunPower Solar Pvt Ltd &middot; This is an automated message
  </div>
</div>
</body></html>`
}

// ── template catalogue (one renderer per enqueue() template name) ──

type Renderer = (p: Record<string, unknown>) => { subject: string; title: string; body: string }

const TEMPLATES: Record<string, Renderer> = {
  PORTAL_LINK: (p) => ({
    subject: 'Your SunPower portal link',
    title: 'Your personal solar portal is ready',
    body: `${greeting(p.name)}${para('Track your quotation, installation and service tickets in one place.')}${link('Open My SunPower', p.link)}`,
  }),
  PORTAL_LINK_RESENT: (p) => ({
    subject: 'Your SunPower portal link (re-sent)',
    title: 'Your SunPower portal link',
    body: `${greeting(p.name)}${para('Here is your SunPower portal link again, as requested.')}${link('Open My SunPower', p.link)}`,
  }),
  SURVEY_SCHEDULED: (p) => ({
    subject: `Site survey scheduled — ${str(p.when ? fmtDate(p.when) : '')}`,
    title: 'Your site survey is booked',
    body: `${greeting(p.name)}${para('Our technician will visit you for the site survey at the following time:')}${row('When', fmtDate(p.when))}${para('Please ensure roof access is available.')}`,
  }),
  SURVEY_APPROVED: (p) => ({
    subject: 'Your site survey is approved',
    title: 'Site survey approved',
    body: `${greeting(p.name)}${para('Great news — your site survey has been approved. Our sales team will share your quotation shortly.')}`,
  }),
  QUOTE_SENT: (p) => ({
    subject: `Quotation ${str(p.quoteNumber) || 'ready'}`,
    title: `Quotation ${str(p.quoteNumber)}`,
    body: `${greeting(p.name)}${para('Your solar quotation is ready for review.')}${row('Quote total', inr(p.total))}${row('Valid until', fmtDate(p.validUntil))}${link('View quotation', p.link)}`,
  }),
  QUOTE_ACCEPTED: (p) => ({
    subject: `Quotation ${str(p.quoteNumber)} accepted`,
    title: 'Thank you for accepting our quotation',
    body: `${greeting(p.name)}${para(`We have recorded your acceptance of quotation ${str(p.quoteNumber)} and created order ${str(p.orderNumber)}.`)}${row('Advance payable', inr(p.advance))}${para('Our team will call you to confirm the installation date once the advance is received.')}`,
  }),
  QUOTE_REJECTED: (p) => ({
    subject: `Quotation ${str(p.quoteNumber)} rejected`,
    title: `Quotation ${str(p.quoteNumber)} was rejected`,
    body: `${para('A customer has rejected this quotation.')}${row('Reason', str(p.reason) || '—')}${para('Please review the lead and follow up.')}`,
  }),
  ORDER_CONFIRMED_CUSTOMER: (p) => ({
    subject: `Order ${str(p.orderNumber)} confirmed`,
    title: 'Your order is confirmed',
    body: `${greeting(p.name)}${para(`Your order ${str(p.orderNumber)} has been confirmed. We will schedule your installation shortly.`)}`,
  }),
  ORDER_CONFIRMED_WAREHOUSE: (p) => ({
    subject: `Order ${str(p.orderNumber)} confirmed — prepare dispatch`,
    title: `Warehouse action: order ${str(p.orderNumber)}`,
    body: `${para('A new order has been confirmed and needs dispatch preparation.')}${row('Order', str(p.orderNumber))}${row('Dispatch', str(p.dispatchNumber) || '—')}`,
  }),
  ORDER_CANCELLED: (p) => ({
    subject: `Order ${str(p.orderNumber)} cancelled`,
    title: 'Your order has been cancelled',
    body: `${greeting(p.name)}${para(`Order ${str(p.orderNumber)} has been cancelled.`)}${row('Reason', str(p.reason) || '—')}${Number(p.refundedPaise) > 0 ? row('Refund initiated', inr(p.refundedPaise)) : ''}`,
  }),
  PAYMENT_REVERSED: (p) => ({
    subject: `Payment reversal on order ${str(p.orderNumber)}`,
    title: 'A payment on your order was reversed',
    body: `${greeting(p.name)}${para(`A payment of ${inr(p.amount)} on order ${str(p.orderNumber)} has been reversed.`)}${row('Reason', str(p.reason) || '—')}`,
  }),
  PAYMENT_RECEIVED_ONLINE: (p) => ({
    subject: `Payment of ${inr(p.amountPaise)} received — receipt ${str(p.receipt)}`,
    title: 'We have received your payment',
    body: `${greeting(p.name)}${para(`Your online payment of ${inr(p.amountPaise)} for order ${str(p.orderNumber)} has been received. Thank you!`)}${row('Receipt reference', str(p.receipt) || '—')}${row('Paid towards', str(p.orderNumber) || '—')}${row('Balance due', inr(p.balancePaise))}${para('You can see the updated balance any time on your My SunPower page.')}`,
  }),
  PAYMENT_RECEIVED: (p) => ({
    subject: `Payment receipt: ${inr(p.amountPaise)} received (${str(p.method)}) — Order ${str(p.orderNumber)}`,
    title: 'Payment Receipt Confirmation',
    body: `${greeting(p.name)}${para(`We have successfully recorded your ${str(p.method)} payment of ${inr(p.amountPaise)} towards order ${str(p.orderNumber)}.`)}${row('Payment Method', str(p.method))}${row('Reference / Receipt', str(p.reference) || '—')}${row('Amount Paid', inr(p.amountPaise))}${row('Remaining Balance', inr(p.balancePaise))}${p.link ? link('View Order in My SunPower', p.link) : ''}`,
  }),
  INSTALLATION_SCHEDULED: (p) => ({
    subject: `Installation scheduled for ${fmtDate(p.date)}`,
    title: 'Your installation date is confirmed',
    body: `${greeting(p.name)}${row('Date', fmtDate(p.date))}${row('Slot', slotLabel(p.slot))}${row('Crew lead', str(p.crewLead) || '—')}${para('Please keep the site ready and roof access clear on the day.')}`,
  }),
  INSTALLATION_RESCHEDULED: (p) => ({
    subject: `Installation rescheduled to ${fmtDate(p.newDate)}`,
    title: 'Your installation has been rescheduled',
    body: `${greeting(p.name)}${para(`The installation for order ${str(p.orderNumber)} has been moved.`)}${row('New date', fmtDate(p.newDate))}${row('Reason', str(p.reason) || '—')}`,
  }),
  INSTALLATION_ON_HOLD: (p) => ({
    subject: `Installation on hold — order ${str(p.orderNumber)}`,
    title: 'Your installation is on hold',
    body: `${greeting(p.name)}${para(`The installation for order ${str(p.orderNumber)} has been put on hold.`)}${row('Reason', str(p.reason) || '—')}${p.newDate ? row('New date', fmtDate(p.newDate)) : ''}${para('We will contact you shortly to re-plan.')}`,
  }),
  DISPATCHED: (p) => ({
    subject: `Equipment dispatched — ${str(p.dispatchNumber)}`,
    title: 'Your equipment is on the way',
    body: `${greeting(p.name)}${para(`Dispatch ${str(p.dispatchNumber)} has left our warehouse and is on its way to your site.`)}`,
  }),
  DELIVERED: (p) => ({
    subject: 'Equipment delivered — warranty activated',
    title: 'Your equipment has been delivered',
    body: `${greeting(p.name)}${para('Your solar equipment has been delivered to site.')}${Number(p.warranties) > 0 ? row('Warranties activated', `${Number(p.warranties)}`) : ''}`,
  }),
  INSTALLATION_COMPLETED: (p) => ({
    subject: `Installation complete — order ${str(p.orderNumber)}`,
    title: 'Your installation is complete',
    body: `${greeting(p.name)}${para('Your solar system has been commissioned and signed off. Your completion certificate is ready.')}${link('View certificate', p.link)}`,
  }),
  WARRANTY_ACTIVATED: (p) => ({
    subject: 'Warranty activated',
    title: 'Your warranty is now active',
    body: `${greeting(p.name)}${para(`${Number(p.count) || 1} product warranty${Number(p.count) === 1 ? ' has' : 's have'} been activated for your installation.`)}${link('View warranty details', p.link)}`,
  }),
  WARRANTY_REMINDER: (p) => ({
    subject: `Warranty reminder — ${str(p.product) || 'your system'}`,
    title: 'Warranty ending soon',
    body: `${greeting(p.name)}${para(`The warranty on ${str(p.product) || 'your product'} is approaching its end date.`)}${row('Warranty ends', fmtDate(p.endDate))}${para('Contact us if you would like to extend or service the equipment.')}`,
  }),
  WARRANTY_VOIDED: (p) => ({
    subject: 'Warranty voided',
    title: 'A warranty has been voided',
    body: `${greeting(p.name)}${para('The warranty on the following equipment has been voided as approved.')}${row('Unit', str(p.serial) || '—')}${para('If you believe this is a mistake, please contact support.')}`,
  }),
  WARRANTY_EXCLUSION_REQUEST: (p) => ({
    subject: `Warranty exclusion requested — unit ${str(p.unit)}`,
    title: 'Warranty exclusion approval needed',
    body: `${para('A support engineer has requested a warranty exclusion.')}${row('Unit', str(p.unit) || '—')}${row('Reason', str(p.reason) || '—')}${row('Evidence photos', `${Number(p.photos) || 0}`)}`,
  }),
  TICKET_OPENED: (p) => ({
    subject: `Service ticket ${str(p.ticketNumber)} opened`,
    title: 'We have logged your service request',
    body: `${greeting(p.name)}${para(`Your service ticket ${str(p.ticketNumber)} has been created.`)}${row('Warranty verdict', str(p.verdict).replaceAll('_', ' ').toLowerCase() || '—')}${para('Our support team will contact you shortly.')}`,
  }),
  TICKET_RESOLVED: (p) => ({
    subject: `Service ticket ${str(p.ticketNumber)} resolved`,
    title: 'Your service ticket is resolved',
    body: `${greeting(p.name)}${para(`Ticket ${str(p.ticketNumber)} has been resolved.`)}${row('Billing', p.chargeable ? 'Chargeable' : 'Covered under warranty')}${para('If the issue recurs, just reply to this email or call us.')}`,
  }),
  LEAD_SLA_BREACH: (p) => ({
    subject: `SLA breach — lead ${str(p.leadNumber)}`,
    title: `Lead ${str(p.leadNumber)} breached its first-contact SLA`,
    body: `${para('An open lead has passed its 4-business-hour first-contact SLA.')}${row('Customer', str(p.customer) || '—')}${row('Phone', str(p.phone) || '—')}${row('Owner', str(p.owner) || '—')}${para('Please contact the customer immediately.')}`,
  }),
  STOCK_SHORTAGE: (p) => ({
    subject: `Stock shortage on order ${str(p.orderNumber)}`,
    title: `Shortage on order ${str(p.orderNumber)}`,
    body: `${para('An order was confirmed while stock was insufficient:')}${row('Product', str(p.product) || '—')}${row('Short by', `${Number(p.short) || 0}`)}${para('Purchase or transfer stock to cover the shortage before dispatch.')}`,
  }),
  LOW_STOCK: (p) => {
    const items = (Array.isArray(p.items) ? p.items : []) as Record<string, unknown>[]
    const rowsHtml = items
      .map((it) => `<tr><td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${esc(str(it.name) || '—')}</td><td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${Number(it.available) || 0}</td><td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${Number(it.reorder) || 0}</td></tr>`)
      .join('')
    return {
      subject: `Low stock alert — ${items.length} item${items.length === 1 ? '' : 's'}`,
      title: 'Products below reorder level',
      body: `${para('The following products have fallen below their reorder level:')}${rowsHtml ? `<table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;"><thead><tr><th style="text-align: left; padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Product</th><th style="text-align: right; padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Available</th><th style="text-align: right; padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Reorder at</th></tr></thead><tbody>${rowsHtml}</tbody></table>` : para('No items to list.')}${para('Please raise purchase orders to replenish.')}`,
    }
  },
}

/** Render a queued outbox message to email subject + HTML. Unknown template → null. */
export function renderEmail(template: string, payload: Record<string, unknown>): { subject: string; html: string } | null {
  const renderer = TEMPLATES[template]
  if (!renderer) return null
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const r = renderer(safePayload)
  return { subject: r.subject, html: layout(r.title, r.body) }
}
