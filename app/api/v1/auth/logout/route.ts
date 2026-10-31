import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { extractToken, verifyJwt, generateClearSessionCookie } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie');
    const authHeader = req.headers.get('authorization');
    const token = extractToken(cookieHeader, authHeader);

    if (token) {
      const payload = verifyJwt(token);
      if (payload?.sessionId) {
        // Delete database session (Spec 2.6)
        await prisma.session.delete({
          where: { id: payload.sessionId },
        }).catch(() => {});
      }
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    response.headers.set('Set-Cookie', generateClearSessionCookie());
    return response;
  } catch (err: any) {
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
    response.headers.set('Set-Cookie', generateClearSessionCookie());
    return response;
  }
}

