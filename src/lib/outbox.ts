import { prisma } from './db';
import crypto from 'crypto';

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
  const db = tx || prisma;
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

