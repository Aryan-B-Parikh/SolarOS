import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { SESSION_COOKIE, SESSION_COOKIE_NAME } from '@/lib/handler';
import { verifyJwt } from '@/lib/jwt';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const solarToken = req.cookies.get(SESSION_COOKIE)?.value;
  const jwtToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (solarToken) {
    await prisma.session.deleteMany({ where: { token: solarToken } }).catch(() => {});
  }
  if (jwtToken && jwtToken.includes('.')) {
    const payload = verifyJwt(jwtToken);
    if (payload?.sessionId) {
      await prisma.session.delete({ where: { id: payload.sessionId } }).catch(() => {});
    }
  }

  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
