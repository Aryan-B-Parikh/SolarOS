// Human-readable document numbers (L-2026-0142, Q-2026-0098, SO-2026-0061) from
// row-locked number_sequences (Backend Schema 5.2). SQLite serialises writes.
// Accepts a transaction client so multi-write flows stay atomic (D1).

import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export type TxLike = Prisma.TransactionClient | typeof db

export async function nextNumber(name: 'LEAD' | 'QUOTE' | 'ORDER' | 'PAYMENT' | 'INVOICE' | 'DISPATCH' | 'TICKET' | 'GRN' | 'PO' | 'CUSTOMER' | 'SURVEY', prefix: string, tx?: TxLike): Promise<string> {
  const client = tx ?? db
  const year = new Date().getUTCFullYear()
  const seq = await client.numberSequence.upsert({
    where: { name_year: { name, year } },
    create: { name, year, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  })
  const n = seq.nextValue - 1
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`
}

// seeded sequences start at these values
export const SEQ_PREFIX: Record<string, string> = {
  LEAD: 'L', QUOTE: 'Q', ORDER: 'SO', PAYMENT: 'PAY', INVOICE: 'INV',
  DISPATCH: 'DSP', TICKET: 'T', GRN: 'GRN', PO: 'PO', CUSTOMER: 'C', SURVEY: 'SVY',
}
