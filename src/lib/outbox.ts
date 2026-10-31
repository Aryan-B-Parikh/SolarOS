import crypto from 'crypto';

async function getDb(tx?: any) {
  if (tx) return tx;
  const mod = await import('./db.ts');
  return mod.prisma || mod.default;
}

export type OutboxChannel = 'EMAIL' | 'SMS';

export interface OutboxPayload {
  channel: OutboxChannel;
  recipient: string;
  template: string;
  payload: Record<string, any>;
  idempotencyKey?: string;
}

// Retries schedule in minutes: 5 min, 15 min, 1 h (60 min), 6 h (360 min), 24 h (1440 min)
export const OUTBOX_RETRY_INTERVALS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  360 * 60 * 1000,
  1440 * 60 * 1000,
];

/**
 * Enqueues a notification to the outbox inside a transaction
 */
export async function queueNotification(data: OutboxPayload, tx?: any) {
  const db = await getDb(tx);
  const key = data.idempotencyKey || crypto.randomUUID();

  return db.outbox.create({
    data: {
      channel: data.channel,
      recipient: data.recipient,
      template: data.template,
      payload: data.payload,
      idempotency_key: key,
      status: 'QUEUED',
      attempts: 0,
      next_attempt_at: new Date(),
    },
  });
}

/**
 * Calculates next retry timestamp based on attempts count
 */
export function getNextAttemptDate(attempts: number): Date | null {
  if (attempts >= OUTBOX_RETRY_INTERVALS_MS.length) {
    return null; // Exceeded retries, mark DEAD
  }
  return new Date(Date.now() + OUTBOX_RETRY_INTERVALS_MS[attempts]);
}

/**
 * Updates outbox delivery status after a provider attempt (D6 / Phase 4 Acceptance)
 * Moves to DELIVERED on receipt; retries on failure; transitions to DEAD after 5 attempts.
 */
export async function updateOutboxAttempt(
  outboxId: string,
  result: {
    status: 'DELIVERED' | 'FAILED';
    providerMessageId?: string;
    errorMessage?: string;
  },
  tx?: any
) {
  const db = await getDb(tx);
  const item = await db.outbox.findUnique({ where: { id: outboxId } });
  if (!item) return null;

  if (result.status === 'DELIVERED') {
    return db.outbox.update({
      where: { id: outboxId },
      data: {
        status: 'DELIVERED',
        delivered_at: new Date(),
        provider_message_id: result.providerMessageId || null,
        last_error: null,
      },
    });
  }

  // Handle failure & retry intervals
  const nextAttempts = item.attempts + 1;
  const nextDate = getNextAttemptDate(nextAttempts);

  if (!nextDate || nextAttempts >= 5) {
    // Ends DEAD after 5 attempts
    return db.outbox.update({
      where: { id: outboxId },
      data: {
        status: 'DEAD',
        attempts: nextAttempts,
        last_error: result.errorMessage || 'Exceeded 5 delivery attempts',
      },
    });
  }

  return db.outbox.update({
    where: { id: outboxId },
    data: {
      status: 'FAILED',
      attempts: nextAttempts,
      next_attempt_at: nextDate,
      last_error: result.errorMessage || 'Send attempt failed',
    },
  });
}

