import { NextRequest, NextResponse } from 'next/server';
import { rejectQuoteByPublicToken } from '@/services/quotes';
import { z } from 'zod';

const RejectQuoteBodySchema = z.object({
  rejectReason: z.string().min(3, 'Please provide a reason for declining the quotation'),
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
    const parsed = RejectQuoteBodySchema.safeParse(json);
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

    const result = await rejectQuoteByPublicToken(rawToken, {
      rejectReason: parsed.data.rejectReason,
      phoneLastFour: parsed.data.phoneLastFour,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Quotation declined. Our sales team has been notified.',
      quoteNumber: result.quoteNumber,
      status: result.status,
    });

    response.headers.set('X-Robots-Tag', 'noindex, no-referrer');
    return response;
  } catch (error: any) {
    const status = error.statusCode || (error.code === 'LINK_LOCKED' ? 429 : error.code === 'VERIFICATION_REQUIRED' ? 403 : 500);
    return NextResponse.json(
      {
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Failed to reject quotation',
        },
      },
      { status }
    );
  }
}
