import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { confirmOrder } from './orders';
import { PaymentMethod, PaymentKind, PaymentStatus, OrderStatus } from '@prisma/client';
import { rupeesToPaise } from '@/lib/money';

export interface RecordPaymentDto {
  orderId: string;
  amountRupees: number;
  method: PaymentMethod;
  kind: PaymentKind;
  reference?: string;
  receivedOn: string;
  idempotencyKey: string;
}

export async function recordPayment(data: RecordPaymentDto, recordedByUserId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Idempotency Check (ADR D16)
    const existing = await tx.payment.findUnique({
      where: { idempotency_key: data.idempotencyKey },
    });
    if (existing) {
      return { payment: existing, duplicate: true };
    }

    const order = await tx.order.findUnique({
      where: { id: data.orderId },
      include: { customer: true },
    });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);

    const amountPaise = rupeesToPaise(data.amountRupees);
    if (amountPaise <= 0n) {
      throw new AppError('VALIDATION_FAILED', 'Payment amount must be greater than zero.', 400);
    }

    // 2. Create Payment Record
    const payment = await tx.payment.create({
      data: {
        order_id: order.id,
        amount_paise: amountPaise,
        method: data.method,
        kind: data.kind,
        reference: data.reference || null,
        received_on: new Date(data.receivedOn),
        status: PaymentStatus.RECORDED,
        idempotency_key: data.idempotencyKey,
        recorded_by: recordedByUserId,
      },
    });

    // 3. Update Order Paid Amount
    const newPaidPaise = order.paid_paise + amountPaise;
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: { paid_paise: newPaidPaise },
    });

    // 4. Auto-confirmation check (FR-4.3)
    let autoConfirmed = false;
    if (
      order.status === OrderStatus.PENDING_ADVANCE &&
      newPaidPaise >= order.advance_required_paise
    ) {
      await confirmOrder(order.id, undefined, tx);
      autoConfirmed = true;
    }

    await recordAudit(
      {
        actorType: 'USER',
        actorId: recordedByUserId,
        entityType: 'PAYMENT',
        entityId: payment.id,
        action: 'PAYMENT_RECORDED',
        after: {
          orderId: order.id,
          amountPaise: amountPaise.toString(),
          method: data.method,
          autoConfirmed,
        },
      },
      tx
    );

    return { payment, autoConfirmed };
  });
}

