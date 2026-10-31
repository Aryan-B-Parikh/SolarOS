import { NextRequest, NextResponse } from 'next/server';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { reopenTicket } from '@/services/tickets';

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

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; ticketId: string } }
) {
  try {
    const customer = await getPortalCustomer(params.token);
    const rawBody = await req.json().catch(() => ({}));

    const reason = rawBody.reason || 'Customer requested ticket reopening from portal';

    // Verify ticket belongs to customer
    const ticket = await prisma.serviceTicket.findUnique({
      where: { id: params.ticketId },
    });

    if (!ticket || ticket.customer_id !== customer.id) {
      return NextResponse.json(
        { error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found for this customer' } },
        { status: 404 }
      );
    }

    const updated = await reopenTicket(ticket.id, { reason });

    return NextResponse.json(updated);
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      { error: { code: error.code || 'INTERNAL_ERROR', message: error.message } },
      { status }
    );
  }
}

