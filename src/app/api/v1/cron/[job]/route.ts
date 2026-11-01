import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { requireRole } from '@/lib/auth'
import { runOutbox } from '@/lib/outbox'
import { runMaintenanceRules } from '@/services/maintenance'
import { runLeadSlaSweep } from '@/services/leads'
import { expireStaleQuotes } from '@/services/quotes'
import { db } from '@/lib/db'
import { istToday, fromIstDateString } from '@/lib/dates'
import { sendEmail, isMailerConfigured } from '@/lib/mailer'
import { stockOverview } from '@/services/inventory'

// Platform cron calls these with CRON_SECRET; only the DIRECTOR may trigger
// them from the UI by hand (D10 "authenticated cron").
export async function POST(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params
  const secret = req.headers.get('x-cron-secret')
  const envSecret = process.env.CRON_SECRET
  const hasSecret = !!(secret && envSecret && secret === envSecret)
  return handler(req, async () => {
    if (!hasSecret) {
      await requireRole('DIRECTOR') // director-only manual trigger for the demo
    }
    if (job === 'outbox') return await runOutbox()
    if (job === 'maintenance') return await runMaintenanceRules()
    if (job === 'lead-sla') return await runLeadSlaSweep()
    if (job === 'quote-expiry') return await expireStaleQuotes()
    if (job === 'digest') return await runDailyDigest()
    if (job === 'reconcile') {
      // ledger check: recompute balances from movements and compare
      const movements = await db.stockMovement.findMany()
      const wh = await db.stockLocation.findUnique({ where: { code: 'WH1' } })
      const net = new Map<string, number>()
      for (const m of movements) {
        if (m.toLocationId === wh?.id) net.set(m.productId, (net.get(m.productId) ?? 0) + m.qty)
        if (m.fromLocationId === wh?.id) net.set(m.productId, (net.get(m.productId) ?? 0) - m.qty)
      }
      const levels = await db.stockLevel.findMany({ where: { locationId: wh!.id } })
      const mismatches = levels.filter((l) => Math.abs((net.get(l.productId) ?? 0) - l.onHand) > 0.001)
      return { checked: levels.length, mismatches: mismatches.length, ok: mismatches.length === 0 }
    }
    throw new AppError('NOT_FOUND', 'Unknown cron job.')
  })
}

/** Daily ops digest (IST calendar day): key counters emailed to ADMIN_EMAIL. */
async function runDailyDigest() {
  const today = istToday()
  const startOfToday = fromIstDateString(today)

  const newLeads = await db.lead.count({ where: { createdAt: { gte: startOfToday } } })

  const ticketRows = await db.serviceTicket.groupBy({
    by: ['priority'],
    where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
    _count: { _all: true },
  })
  const openTickets: Record<string, number> = { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 }
  let openTicketsTotal = 0
  for (const r of ticketRows) {
    openTickets[r.priority] = (openTickets[r.priority] ?? 0) + r._count._all
    openTicketsTotal += r._count._all
  }

  const overdueLeadSlas = await db.lead.count({
    where: { status: { in: ['NEW', 'CONTACTED'] }, firstContactedAt: null, slaDueAt: { lt: new Date() } },
  })

  const deadOutbox = await db.outbox.count({ where: { status: 'DEAD' } })

  const payments = await db.payment.findMany({ where: { receivedOn: today, status: 'RECEIVED' }, select: { amountPaise: true } })
  const paymentsToday = payments.length
  const paymentsTotalPaise = payments.reduce((s, p) => s + p.amountPaise, 0)

  const lowStockRows = await stockOverview({ lowOnly: true })

  const digest = {
    date: today,
    newLeadsToday: newLeads,
    openTicketsByPriority: openTickets,
    openTicketsTotal,
    overdueLeadSlas,
    deadOutbox,
    paymentsToday,
    paymentsTodayPaise: paymentsTotalPaise,
    lowStockCount: lowStockRows.length,
    lowStockItems: lowStockRows.map((r) => ({ name: r.name, available: r.available, reorderLevel: r.reorderLevel })),
  }

  let emailSent = false
  let emailError: string | null = null
  const adminEmail = process.env.ADMIN_EMAIL
  if (isMailerConfigured() && adminEmail) {
    try {
      await sendEmail({ to: adminEmail, subject: `SunPower daily digest — ${today}`, html: digestHtml(digest) })
      emailSent = true
    } catch (err) {
      emailError = (err instanceof Error ? err.message : String(err)).slice(0, 200)
    }
  }
  return { ...digest, paymentsTodayInr: (paymentsTotalPaise / 100).toFixed(2), emailSent, emailError }
}

function digestHtml(d: {
  date: string
  newLeadsToday: number
  openTicketsByPriority: Record<string, number>
  openTicketsTotal: number
  overdueLeadSlas: number
  deadOutbox: number
  paymentsToday: number
  paymentsTodayPaise: number
  lowStockItems: { name: string; available: number; reorderLevel: number }[]
}): string {
  const cell = (v: string | number, right = false) => `<td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;${right ? ' text-align: right;' : ''}">${String(v)}</td>`
  const head = (v: string, right = false) => `<th style="padding: 6px 10px; border-bottom: 2px solid #cbd5e1; text-align: ${right ? 'right' : 'left'};">${v}</th>`
  const inr = `₹${(d.paymentsTodayPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const lowRows = d.lowStockItems
    .map((it) => `<tr>${cell(it.name)}${cell(it.available, true)}${cell(it.reorderLevel, true)}</tr>`)
    .join('')
  return `<!DOCTYPE html><html><body style="margin: 0; padding: 24px; background: #f1f5f9;">
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
  <div style="background: #f59e0b; padding: 16px 24px;"><span style="font-size: 18px; font-weight: 700; color: #1e293b;">&#9728;&#65039; SunPower Solar</span></div>
  <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
    <h2 style="margin: 0 0 14px; font-size: 17px; color: #0f172a;">Daily ops digest — ${d.date}</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr>${head('New leads today')}${head(String(d.newLeadsToday), true)}</tr>
      <tr>${head('Open tickets')}${head(`${d.openTicketsTotal} (URGENT ${d.openTicketsByPriority.URGENT ?? 0} · HIGH ${d.openTicketsByPriority.HIGH ?? 0} · NORMAL ${d.openTicketsByPriority.NORMAL ?? 0} · LOW ${d.openTicketsByPriority.LOW ?? 0})`, true)}</tr>
      <tr>${head('Overdue lead SLAs')}${head(String(d.overdueLeadSlas), true)}</tr>
      <tr>${head('Payments received today')}${head(`${d.paymentsToday} · ${inr}`, true)}</tr>
      <tr>${head('Outbox dead letters')}${head(String(d.deadOutbox), true)}</tr>
    </table>
    <h3 style="margin: 18px 0 6px; font-size: 14px; color: #0f172a;">Low stock (${d.lowStockItems.length})</h3>
    ${lowRows ? `<table style="width: 100%; border-collapse: collapse; font-size: 13px;"><thead><tr>${head('Product')}${head('Available', true)}${head('Reorder at', true)}</tr></thead><tbody>${lowRows}</tbody></table>` : '<p style="margin: 4px 0; color: #64748b;">All products above reorder level.</p>'}
  </div>
  <div style="padding: 14px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px;">SunPower Solar Pvt Ltd &middot; This is an automated message</div>
</div>
</body></html>`
}
