import crypto from 'crypto';
import { prisma } from './db';

/**
 * Computes a hash of response object to store with idempotency key
 */
export function hashResponse(response: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(response)).digest('hex');
}

/**
 * Checks or registers an idempotency key in the database
 * If key already exists for the given scope, returns the cached status or throws conflict
 */
export async function checkIdempotency(scope: string, key: string, tx?: any) {
  const db = tx || prisma;
  const existing = await db.idempotencyKey.findUnique({
    where: {
      scope_key: {
        scope,
        key,
      },
    },
  });

  return existing;
}

/**
 * Records an idempotency key with its response hash
 */
export async function recordIdempotency(scope: string, key: string, response: any, tx?: any) {
  const db = tx || prisma;
  const responseHash = hashResponse(response);
  return db.idempotencyKey.create({
    data: {
      scope,
      key,
      response_hash: responseHash,
    },
  });
}

