import { NextRequest, NextResponse } from 'next/server';
import { getPublicWarrantyInfo } from '@/services/warranty';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code;
    const warrantyInfo = await getPublicWarrantyInfo(code);

    return NextResponse.json(warrantyInfo, {
      status: warrantyInfo.isFound ? 200 : 404,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to check warranty' } },
      { status: 500 }
    );
  }
}

