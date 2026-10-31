import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { hashToken, evaluateLinkStatus } from '@/lib/access-links';
import { storage, verifyStorageSignature } from '@/lib/storage';
import { formatErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Authenticated attachment download (D14 / X-SEC-FILES).
 *
 * Access is granted to:
 *  1. signed-in staff (session cookie), or
 *  2. a holder of `?sig=` (short-lived HMAC signature minted by the server
 *     for embedding images in token-gated pages), or
 *  3. a holder of a valid customer portal link `?portal=<rawToken>` whose
 *     customer owns the attachment (portal galleries).
 *
 * Never public, never cached by shared caches.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const sig = url.searchParams.get('sig');
    const portalToken = url.searchParams.get('portal');

    let allowed = false;

    // 1. Staff session
    const user = await getSessionUser();
    if (user) allowed = true;

    // 2. Short-lived HMAC signature
    if (!allowed && sig && verifyStorageSignature(attachment.storage_key, sig)) {
      allowed = true;
    }

    // 3. Valid portal link owned by the same customer as the attachment
    if (!allowed && portalToken) {
      const link = await prisma.customerAccessLink.findUnique({
        where: { token_hash: hashToken(portalToken) },
      });
      if (link && evaluateLinkStatus(link as any) === 'VALID') {
        const customerId = link.customer_id;
        allowed = await attachmentBelongsToCustomer(attachment.owner_type, attachment.owner_id, customerId);
      }
    }

    if (!allowed) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not authorized to view this file' } },
        { status: 403 }
      );
    }

    const bytes = await storage.get(attachment.storage_key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': attachment.mime,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${attachment.id}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/** Resolves whether an owned entity (by type) belongs to the given customer. */
async function attachmentBelongsToCustomer(
  ownerType: string,
  ownerId: string,
  customerId: string
): Promise<boolean> {
  switch (ownerType) {
    case 'ORDER':
      return !!(await prisma.order.findFirst({ where: { id: ownerId, customer_id: customerId } }));
    case 'INSTALLATION': {
      const inst = await prisma.installation.findUnique({
        where: { id: ownerId },
        include: { order: { select: { customer_id: true } } },
      });
      return inst?.order.customer_id === customerId;
    }
    case 'TICKET':
      return !!(await prisma.serviceTicket.findFirst({ where: { id: ownerId, customer_id: customerId } }));
    case 'SURVEY': {
      const survey = await prisma.siteSurvey.findUnique({
        where: { id: ownerId },
        include: { lead: { select: { customer_id: true } } },
      });
      return survey?.lead.customer_id === customerId;
    }
    case 'LEAD':
      return !!(await prisma.lead.findFirst({ where: { id: ownerId, customer_id: customerId } }));
    default:
      return false;
  }
}
