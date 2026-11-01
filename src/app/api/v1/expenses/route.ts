import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { recordExpense } from '@/services/analytics'
import { audit } from '@/lib/outbox'

const schema = z.object({
  category: z.enum(['FUEL', 'TRANSPORT', 'RENT', 'MARKETING', 'MISC', 'LABOUR']),
  amountRupees: z.number().positive(),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
  orderId: z.string().nullable().optional(),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const user = await requireCapability('payments.write')
    const expense = await recordExpense({
      category: body.category, amountPaise: Math.round(body.amountRupees * 100),
      incurredOn: body.incurredOn, description: body.description, orderId: body.orderId ?? null, actorId: user.id,
    })
    await audit({
      actorType: 'USER', actorId: user.id, entityType: 'expense', entityId: expense.id,
      action: 'EXPENSE_RECORD',
      after: { category: expense.category, amountPaise: expense.amountPaise, incurredOn: expense.incurredOn, description: expense.description },
    })
    return { expense }
  })
}
