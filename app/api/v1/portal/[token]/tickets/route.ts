import { NextRequest, NextResponse } from 'next/server';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { PortalCreateTicketSchema } from '@/contracts';
import { createTicket } from '@/services/tickets';

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
  { params }: { params: { token: string } }
) {
  try {
    const customer = await getPortalCustomer(params.token);
    const rawBody = await req.json();
    const parseResult = PortalCreateTicketSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Invalid ticket data', details: parseResult.error.format() } },
        { status: 400 }
      );
    }

    const { category, faultCode, description, priority, installationId, unitId } = parseResult.data;

    const ticket = await createTicket({
      customerId: customer.id,
      installationId,
      unitId,
      channel: 'WEB',
      category,
      faultCode,
      description,
      priority,
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      { error: { code: error.code || 'INTERNAL_ERROR', message: error.message } },
      { status }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const customer = await getPortalCustomer(params.token);

    const tickets = await prisma.serviceTicket.findMany({
      where: { customer_id: customer.id },
      include: {
        unit: { include: { product: true } },
        warranty: true,
        events: { orderBy: { created_at: 'desc' } },
        invoices: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json(tickets);
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      { error: { code: error.code || 'INTERNAL_ERROR', message: error.message } },
      { status }
    );
  }
}

