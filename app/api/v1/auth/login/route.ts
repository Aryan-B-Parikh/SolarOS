import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid work email address'),
  password: z.string().min(1, 'Password is required'),
  isFieldDevice: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { success: false, code: 'INVALID_REQUEST', message: 'Missing JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = LoginSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          code: 'VALIDATION_FAILED',
          message: parseResult.error.errors[0]?.message || 'Validation error',
          errors: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { email, password, isFieldDevice } = parseResult.data;
    const authResult = await authenticateUser(email, password, isFieldDevice);

    const response = NextResponse.json({
      success: true,
      user: authResult.user,
      redirectTo: authResult.redirectTo,
      token: authResult.token,
    });

    // Set HttpOnly, SameSite=Lax cookie
    response.headers.set('Set-Cookie', authResult.cookieHeader);

    return response;
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An error occurred during authentication';

    return NextResponse.json(
      {
        success: false,
        code,
        message,
        remainingMinutes: err.remainingMinutes,
      },
      { status: statusCode }
    );
  }
}

