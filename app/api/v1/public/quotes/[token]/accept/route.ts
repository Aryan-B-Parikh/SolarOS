import { NextRequest, NextResponse } from 'next/server';
import { acceptQuoteByPublicToken, getQuoteByPublicToken } from '@/services/quotes';
import { generateSessionCookie } from '@/lib/access-links';
import { z } from 'zod';

const AcceptQuoteBodySchema = z.object({
  acceptedName: z.string().min(2, 'Please provide your full legal name for acceptance signature'),
  phoneLastFour: z.string().regex(/^\d{4}$/, 'Must provide exactly 4 digits of registered phone number'),
  idempotencyKey: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token;
    if (!rawToken || rawToken.length < 16) {
      return NextResponse.json(
        { error: { code: 'INVALID_TOKEN', message: 'Invalid or missing quote access token.' } },
        { status: 400 }
      );
    }

    const json = await req.json();
    const parsed = AcceptQuoteBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Invalid input data',
            details: parsed.error.errors,
          },
        },
        { status: 422 }
      );
    }

    const result = await acceptQuoteByPublicToken(rawToken, {
      acceptedName: parsed.data.acceptedName,
      phoneLastFour: parsed.data.phoneLastFour,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Quotation accepted successfully. Your order is confirmed!',
      orderNumber: result.orderNumber,
    });

    // Resolve customer ID to set verified 30-min session cookie
    try {
      const { quote } = await getQuoteByPublicToken(rawToken);
      const cookieHeader = generateSessionCookie(quote.customer_id, rawToken);
      response.headers.set('Set-Cookie', cookieHeader);
    } catch {
      // Cookie is supplementary to the success response
    }

    response.headers.set('X-Robots-Tag', 'noindex, no-referrer');
    return response;
  } catch (error: any) {
    const status = error.statusCode || (error.code === 'LINK_LOCKED' ? 429 : error.code === 'VERIFICATION_REQUIRED' ? 403 : 500);
    return NextResponse.json(
      {
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Failed to accept quotation',
        },
      },
      { status }
    );
  }
}

