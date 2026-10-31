import { NextRequest, NextResponse } from 'next/server';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import prisma from '@/lib/db';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * FR-10.8 — portal payments & invoices.
 * Validates the customer's portal link, then returns every payment across the
 * customer's orders plus their invoices (with totals) for portal rendering.
 */
async function getPortalCustomer(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const link = await prisma.customerAccessLink.findUnique({
    where: { token_hash: tokenHash },
    include: { customer: true },
  });

  if (!link) {
    throw new AppError('LINK_NOT_FOUND', 'Invalid access link', 404);
  }

  const status = evaluateLinkStatus({
    customerId: link.customer_id,
    scope: link.scope,
    tokenHash: link.token_hash,
    expiresAt: link.expires_at,
    revokedAt: link.revoked_at,
    failedAttempts: link.failed_attempts,
    lockedUntil: link.locked_until,
  });

  if (status !== 'VALID') {
    throw new AppError(`LINK_${status}`, `This portal access link is ${status.toLowerCase()}`, 403);
  }

  return link.customer;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const customer = await getPortalCustomer(params.token);

    const [payments, invoices] = await Promise.all([
      prisma.payment.findMany({
        where: { order: { customer_id: customer.id }, status: { not: 'REVERSED' } },
        include: { order: { select: { order_number: true } } },
        orderBy: { received_on: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { customer_id: customer.id, status: { not: 'CANCELLED' } },
        orderBy: { issue_date: 'desc' },
      }),
    ]);

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        orderNumber: p.order.order_number,
        amountPaise: p.amount_paise,
        method: p.method,
        kind: p.kind,
        reference: p.reference,
        receivedOn: p.received_on.toISOString().split('T')[0],
        status: p.status,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        type: i.type,
        issueDate: i.issue_date.toISOString().split('T')[0],
        dueDate: i.due_date.toISOString().split('T')[0],
        status: i.status,
        subtotalPaise: i.subtotal_paise,
        taxPaise: i.tax_paise,
        totalPaise: i.total_paise,
      })),
    });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      { error: { code: error.code || 'INTERNAL_ERROR', message: error.message } },
      { status }
    );
  }
}
