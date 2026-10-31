import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } },
      { status: 401 }
    );
  }
  return NextResponse.json({ success: true, user });
}
