import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Health must be evaluated per request, never prerendered at build time.
export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  let dbStatus = 'healthy';
  let dbError: string | null = null;

  try {
    // Quick probe
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    dbStatus = 'degraded';
    dbError = err?.message || 'Database connection error';
  }

  const responseTimeMs = Date.now() - startTime;

  return NextResponse.json(
    {
      status: dbStatus === 'healthy' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      responseTimeMs,
      services: {
        database: {
          status: dbStatus,
          error: dbError,
        },
      },
    },
    {
      status: dbStatus === 'healthy' ? 200 : 503,
    }
  );
}

