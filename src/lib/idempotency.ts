// Idempotency (D16): every critical operation (payments, quote acceptance,
// order confirmation, dispatch scan, depart, deliver, sign-off, portal ticket
// creation) may carry a client-generated key. A retry with the same key replays
// the stored response instead of applying the effect twice — weak mobile
// networks must never double-apply a write.

import { db } from '@/lib/db'

export async function withIdempotency<T>(
  scope: string,
  key: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (!key) return fn()
  const existing = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } })
  if (existing?.responseJson) return JSON.parse(existing.responseJson) as T
  const result = await fn()
  try {
    await db.idempotencyKey.create({ data: { scope, key, responseJson: JSON.stringify(result) } })
  } catch {
    // concurrent duplicate: the first writer wins — replay theirs
    const winner = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } })
    if (winner?.responseJson) return JSON.parse(winner.responseJson) as T
  }
  return result
}
