// Transactional outbox (D6, D15): automations write messages inside the triggering
// transaction; a sender delivers them later with retries (QUEUED, SENDING, SENT,
// DELIVERED, FAILED, DEAD) and a unique idempotency key per message.

import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { sendEmail, isMailerConfigured } from '@/lib/mailer'
import { renderEmail } from '@/lib/email-templates'

/** anything that can write rows: the shared client or an interactive transaction */
export type DbClient = Prisma.TransactionClient | typeof db

export interface OutboxMsg {
  channel: 'SMS' | 'EMAIL'
  recipient: string // masked phone/email as shown in UI; real values in payload
  template: string
  payload: Record<string, unknown>
}

export async function enqueue(msgs: OutboxMsg | OutboxMsg[], tx?: DbClient) {
  const list = Array.isArray(msgs) ? msgs : [msgs]
  if (list.length === 0) return
  const client = tx ?? db
  await client.outbox.createMany({
    data: list.map((m) => ({
      channel: m.channel,
      recipient: m.recipient,
      template: m.template,
      payload: JSON.stringify(m.payload),
      idempotencyKey: randomUUID(),
    })),
  })
}

export async function audit(entry: {
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM'
  actorId?: string | null
  entityType: string
  entityId: string
  action: string
  before?: unknown
  after?: unknown
}, tx?: DbClient) {
  const client = tx ?? db
  await client.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
    },
  })
}

/**
 * Outbox sender: delivers due QUEUED/FAILED messages through the real
 * providers — email via Resend (src/lib/mailer.ts), SMS via MSG91/Twilio
 * (not configured in this deployment). Exponential backoff 2^n minutes,
 * DEAD after 5 attempts. Provider-less channels are parked for 6 h
 * without burning attempts so nothing is lost when keys are added later.
 */
export async function runOutbox(): Promise<{ sent: number; delivered: number; failed: number; dead: number; skipped: number }> {
  const due = await db.outbox.findMany({
    where: { status: { in: ['QUEUED', 'FAILED'] }, nextAttemptAt: { lte: new Date() } },
    take: 50,
    orderBy: { createdAt: 'asc' },
  })
  const mailerReady = isMailerConfigured()
  const smsReady = !!(process.env.MSG91_AUTH_KEY || process.env.TWILIO_AUTH_TOKEN)
  let sent = 0, delivered = 0, failed = 0, dead = 0, skipped = 0

  for (const m of due) {
    let payload: Record<string, unknown> = {}
    try {
      payload = typeof m.payload === 'string' && m.payload ? (JSON.parse(m.payload) as Record<string, unknown>) : {}
    } catch {
      payload = {}
    }

    if (m.channel === 'EMAIL') {
      if (!mailerReady) {
        await db.outbox.update({
          where: { id: m.id },
          data: { status: 'QUEUED', lastError: 'Email provider not configured', nextAttemptAt: new Date(Date.now() + 6 * 3600 * 1000) },
        })
        skipped++
        continue
      }
      // the recipient column is masked for customers; EMAIL rows carry the
      // real address, and SMS-style payloads keep it in payload.to
      const to = [payload.to, payload.email]
        .find((v): v is string => typeof v === 'string' && v.includes('@')) ?? (m.recipient.includes('@') ? m.recipient : '')
      if (!to) {
        await db.outbox.update({ where: { id: m.id }, data: { status: 'DEAD', attempts: m.attempts + 1, lastError: 'No recipient address' } })
        dead++
        continue
      }
      const rendered = renderEmail(m.template, payload)
      if (!rendered) {
        await db.outbox.update({ where: { id: m.id }, data: { status: 'DEAD', attempts: m.attempts + 1, lastError: 'Unknown template' } })
        dead++
        continue
      }
      try {
        const res = await sendEmail({ to, subject: rendered.subject, html: rendered.html })
        await db.outbox.update({
          where: { id: m.id },
          data: {
            status: 'DELIVERED', attempts: m.attempts + 1, sentAt: new Date(), deliveredAt: new Date(),
            providerMessageId: res.messageId, lastError: null,
          },
        })
        sent++
        delivered++
      } catch (err) {
        const attempts = m.attempts + 1
        const message = err instanceof Error ? err.message : String(err)
        if (attempts >= 5) {
          await db.outbox.update({ where: { id: m.id }, data: { status: 'DEAD', attempts, lastError: message.slice(0, 300) } })
          dead++
        } else {
          await db.outbox.update({
            where: { id: m.id },
            data: { status: 'FAILED', attempts, nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * 60000), lastError: message.slice(0, 300) },
          })
          failed++
        }
      }
    } else if (m.channel === 'SMS') {
      if (!smsReady) {
        await db.outbox.update({
          where: { id: m.id },
          data: { status: 'QUEUED', lastError: 'SMS provider not configured (Twilio/MSG91 keys not set)', nextAttemptAt: new Date(Date.now() + 6 * 3600 * 1000) },
        })
        skipped++
      } else {
        // SMS providers are not part of this deployment; treat as unimplemented
        await db.outbox.update({ where: { id: m.id }, data: { status: 'DEAD', attempts: m.attempts + 1, lastError: 'SMS delivery not implemented' } })
        dead++
      }
    } else {
      await db.outbox.update({ where: { id: m.id }, data: { status: 'DEAD', attempts: m.attempts + 1, lastError: `Unknown channel ${m.channel}` } })
      dead++
    }
  }
  return { sent, delivered, failed, dead, skipped }
}
