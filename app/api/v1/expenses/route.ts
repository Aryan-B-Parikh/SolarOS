import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { rupeesToPaise } from '@/lib/money';
import { z } from 'zod';

const CreateExpenseSchema = z.object({
  category: z.enum(['MATERIALS', 'LABOUR', 'TRANSPORT', 'PERMITS', 'MISC']),
  amountRupees: z.number().positive(),
  orderId: z.string().uuid().optional(),
  description: z.string().min(3),
  incurredOn: z.string(),
});

export const POST = createApiHandler(
  {
    bodySchema: CreateExpenseSchema,
    allowedRoles: ['DIRECTOR', 'ACCOUNTS'],
  },
  async ({ body, user }) => {
    const amountPaise = rupeesToPaise(body.amountRupees);

    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          category: body.category as any,
          amount_paise: amountPaise,
          order_id: body.orderId || null,
          description: body.description,
          incurred_on: new Date(body.incurredOn),
          recorded_by: user?.id || 'accounts',
        },
      });

      await recordAudit(
        {
          actorType: 'USER',
          actorId: user?.id,
          entityType: 'EXPENSE',
          entityId: exp.id,
          action: 'EXPENSE_RECORDED',
          after: { amountPaise: amountPaise.toString(), category: body.category },
        },
        tx
      );

      return exp;
    });

    return NextResponse.json({ expense }, { status: 201 });
  }
);
