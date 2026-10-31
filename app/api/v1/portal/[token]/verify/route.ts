import { NextRequest, NextResponse } from 'next/server';
import { PortalVerifySchema } from '@/contracts';
import { hashToken, verifyPhoneChallenge, evaluateLinkStatus } from '@/lib/access-links';
import prisma from '@/lib/db';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const rawToken = params.token;
  const tokenHash = hashToken(rawToken);

  try {
    const rawBody = await req.json();
    const parseResult = PortalVerifySchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Last 4 digits of registered phone number required' } },
        { status: 400 }
      );
    }
    const { phoneLastFour } = parseResult.data;

    const link = await prisma.customerAccessLink.findUnique({
      where: { token_hash: tokenHash },
      include: { customer: true },
    });

    if (!link) {
      return NextResponse.json(
        { error: { code: 'LINK_NOT_FOUND', message: 'Invalid or expired access token' } },
        { status: 404 }
      );
    }

    // Evaluate current link state
    const currentStatus = evaluateLinkStatus({
      customerId: link.customer_id,
      scope: link.scope,
      tokenHash: link.token_hash,
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      failedAttempts: link.failed_attempts,
      lockedUntil: link.locked_until,
    });

    if (currentStatus === 'REVOKED') {
      return NextResponse.json(
        { error: { code: 'LINK_REVOKED', message: 'This access link has been revoked' } },
        { status: 403 }
      );
    }

    if (currentStatus === 'EXPIRED') {
      return NextResponse.json(
        { error: { code: 'LINK_EXPIRED', message: 'This access link has expired after 90 days' } },
        { status: 410 }
      );
    }

    if (currentStatus === 'LOCKED') {
      const remainingMinutes = link.locked_until
        ? Math.max(1, Math.ceil((new Date(link.locked_until).getTime() - Date.now()) / 60000))
        : 15;
      return NextResponse.json(
        {
          error: {
            code: 'LINK_LOCKED',
            message: `Too many failed attempts. Link is locked for ${remainingMinutes} more minute(s).`,
          },
        },
        { status: 429 }
      );
    }

    // Perform phone challenge verification
    const challengeResult = verifyPhoneChallenge(
      {
        customerId: link.customer_id,
        scope: link.scope,
        tokenHash: link.token_hash,
        expiresAt: link.expires_at,
        revokedAt: link.revoked_at,
        failedAttempts: link.failed_attempts,
        lockedUntil: link.locked_until,
      },
      link.customer.phone,
      phoneLastFour
    );

    if (!challengeResult.success) {
      // Update failed attempts and lock time in database
      await prisma.customerAccessLink.update({
        where: { id: link.id },
        data: {
          failed_attempts: challengeResult.failedAttempts,
          locked_until: challengeResult.lockedUntil,
        },
      });

      logger.warn('Customer portal verification challenge failed', {
        linkId: link.id,
        failedAttempts: challengeResult.failedAttempts,
        status: challengeResult.linkStatus,
      });

      return NextResponse.json(
        {
          error: {
            code: challengeResult.linkStatus === 'LOCKED' ? 'LINK_LOCKED' : 'VERIFICATION_FAILED',
            message: challengeResult.errorMessage || 'Incorrect phone verification digits',
          },
        },
        { status: challengeResult.linkStatus === 'LOCKED' ? 429 : 401 }
      );
    }

    // Success: reset failures and update last used
    await prisma.customerAccessLink.update({
      where: { id: link.id },
      data: {
        failed_attempts: 0,
        locked_until: null,
        last_used_at: new Date(),
      },
    });

    const response = NextResponse.json({
      success: true,
      verified: true,
      expiresAt: challengeResult.sessionExpiresAt,
      message: 'Identity verified successfully for sensitive portal actions.',
    });

    // Set 30-minute verified session cookie
    if (challengeResult.sessionToken) {
      response.cookies.set('sunpower_portal_verified', challengeResult.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60, // 30 minutes
        path: '/',
      });
    }

    return response;
  } catch (err: any) {
    logger.error('Portal verify route error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to verify at this time' } },
      { status: 500 }
    );
  }
}

