import { NextRequest, NextResponse } from 'next/server';
import { hashToken, evaluateLinkStatus, VERIFIED_SESSION_COOKIE_NAME, validateVerifiedSessionToken } from '@/lib/access-links';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { confirmTicketResolution } from '@/services/tickets';

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
 * FR-10.7 — customer confirms a ticket resolution from the portal (Rule C9).
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
              'Confirming a resolution requires verification. Enter the last 4 digits of your registered phone number on the portal first.',
          },
        },
        { status: 403 }
      );
    }

    const rawBody = await req.json().catch(() => ({}));

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

    const updated = await confirmTicketResolution(ticket.id, {
      confirmationMethod: 'PORTAL',
      customerFeedback: rawBody.feedback,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      { error: { code: error.code || 'INTERNAL_ERROR', message: error.message } },
      { status }
    );
  }
}
