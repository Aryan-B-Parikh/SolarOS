import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { confirmOrder } from './orders';
import { PaymentMethod, PaymentKind, PaymentStatus, OrderStatus } from '@prisma/client';
import { rupeesToPaise } from '@/lib/money';
import crypto from 'crypto';

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

/**
 * Verify HMAC SHA256 signature for Razorpay Webhooks.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  secret?: string
): boolean {
  const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim() === '') {
    if (process.env.NODE_ENV === 'production') return false;
    return signature === 'mock-signature' || signature.length > 0;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(signature, 'utf-8')
    );
  } catch {
    return false;
  }
}

/**
 * Creates a Razorpay checkout order for advance or milestone payments.
 */
export async function createRazorpayOrder(params: {
  orderId: string;
  amountPaise: bigint;
  notes?: Record<string, string>;
}): Promise<{
  id: string;
  amount: number;
  currency: string;
  keyId: string;
}> {
  const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { customer: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);

  const amountNumber = Number(params.amountPaise);

  if (keySecret && !keyId.includes('placeholder')) {
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: amountNumber,
        currency: 'INR',
        receipt: `rcpt_${order.order_number}`,
        notes: {
          orderId: order.id,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          ...params.notes,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json() as any;
      throw new AppError('GATEWAY_ERROR', `Razorpay order creation failed: ${err.error?.description || 'Unknown error'}`, 502);
    }

    const data = await res.json() as any;
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId,
    };
  }

  return {
    id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
    amount: amountNumber,
    currency: 'INR',
    keyId,
  };
}

/**
 * Processes incoming Razorpay webhook payload and records the payment idempotently.
 */
export async function processRazorpayWebhook(
  rawBody: string,
  signature: string
): Promise<{
  success: boolean;
  event: string;
  paymentId?: string;
  orderId?: string;
  autoConfirmed?: boolean;
}> {
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    throw new AppError('FORBIDDEN', 'Invalid Razorpay webhook signature', 403);
  }

  const payload = JSON.parse(rawBody);
  const event = payload.event;

  if (event === 'order.paid' || event === 'payment.captured') {
    const paymentEntity = payload.payload?.payment?.entity || {};
    const notes = paymentEntity.notes || {};
    const orderId = notes.orderId;

    if (!orderId) {
      return { success: true, event, paymentId: paymentEntity.id };
    }

    const amountPaise = BigInt(paymentEntity.amount || 0);
    const amountRupees = Number(amountPaise / 100n);
    const paymentId = paymentEntity.id || `pay_${Date.now()}`;

    let method: PaymentMethod = PaymentMethod.UPI;
    if (paymentEntity.method === 'card') method = PaymentMethod.CARD;
    else if (paymentEntity.method === 'netbanking') method = PaymentMethod.NET_BANKING;

    const systemUser = await prisma.user.findFirst({ where: { role: 'DIRECTOR' } });
    const recordedBy = systemUser?.id || paymentId;

    const result = await recordPayment(
      {
        orderId,
        amountRupees,
        method,
        kind: PaymentKind.ADVANCE,
        reference: paymentId,
        receivedOn: new Date().toISOString(),
        idempotencyKey: `rzp_${paymentId}`,
      },
      recordedBy
    );

    return {
      success: true,
      event,
      paymentId,
      orderId,
      autoConfirmed: result.autoConfirmed,
    };
  }

  return { success: true, event };
}

