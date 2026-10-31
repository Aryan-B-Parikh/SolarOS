import { NextRequest, NextResponse } from 'next/server';
import { hashToken, evaluateLinkStatus, VERIFIED_SESSION_COOKIE_NAME, validateVerifiedSessionToken } from '@/lib/access-links';
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

  return { link, customer: link.customer };
}

/**
 * FR-10.7 — customer reopens a resolved/closed ticket from the portal.
 * Sensitive action (D11): in addition to the valid portal link, this requires
 * the 30-minute verified session cookie granted after the phone last-4
 * challenge (POST /api/v1/portal/[token]/verify).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; ticketId: string } }
) {
  try {
    const { link, customer } = await getPortalCustomer(params.token);

    // D11: enforce the verified session for this sensitive action
    const verifiedCookie = req.cookies.get(VERIFIED_SESSION_COOKIE_NAME)?.value;
    const isVerified = !!(
      verifiedCookie &&
      validateVerifiedSessionToken(verifiedCookie, link.token_hash, customer.id)
    );
    if (!isVerified) {
      return NextResponse.json(
        {
          error: {
            code: 'VERIFICATION_REQUIRED',
            message:
              'Reopening a ticket requires verification. Enter the last 4 digits of your registered phone number on the portal first.',
          },
        },
        { status: 403 }
      );
    }

    const rawBody = await req.json().catch(() => ({}));

    const reason = rawBody.reason || 'Customer requested ticket reopening from portal';
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'A reason of at least 3 characters is required' } },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.ticketId);
    const ticket = await prisma.serviceTicket.findFirst({
      where: isUuid
        ? { OR: [{ id: params.ticketId }, { ticket_number: params.ticketId }] }
        : { ticket_number: params.ticketId },
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
