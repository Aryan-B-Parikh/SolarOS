import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateAccessToken, hashToken } from '@/lib/access-links';

export async function POST(req: NextRequest) {
  try {
    const { identifier } = await req.json();

    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json(
        { error: 'Please enter your registered phone number, inverter serial number, or QR code.' },
        { status: 400 }
      );
    }

    const clean = identifier.trim();

    // 1. Check if identifier is an Inventory Unit QR or Serial Number (e.g. SPU-7F3K9Q, INV3K-24A-001873)
    const unit = await prisma.inventoryUnit.findFirst({
      where: {
        OR: [
          { qr_code: clean },
          { serial_number: clean },
        ],
      },
      include: {
        customer: true,
      },
    });

    if (unit && unit.customer) {
      // Find or create an access link for this customer
      let accessLink = await prisma.customerAccessLink.findFirst({
        where: {
          customer_id: unit.customer.id,
          scope: 'PORTAL',
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
      });

      let rawToken: string;
      if (!accessLink) {
        const tokenRes = generateAccessToken('PORTAL');
        rawToken = tokenRes.rawToken;
        await prisma.customerAccessLink.create({
          data: {
            customer_id: unit.customer.id,
            scope: 'PORTAL',
            token_hash: tokenRes.tokenHash,
            expires_at: tokenRes.expiresAt,
          },
        });
      } else {
        // Issue fresh token for seamless session entry
        const tokenRes = generateAccessToken('PORTAL');
        rawToken = tokenRes.rawToken;
        await prisma.customerAccessLink.update({
          where: { id: accessLink.id },
          data: {
            token_hash: tokenRes.tokenHash,
            expires_at: tokenRes.expiresAt,
            last_used_at: new Date(),
          },
        });
      }

      return NextResponse.json({
        success: true,
        type: 'CUSTOMER',
        redirectUrl: `/portal/${rawToken}`,
        customerName: unit.customer.name,
      });
    }

    // If unit exists but without customer link, redirect to public warranty registry
    if (unit) {
      return NextResponse.json({
        success: true,
        type: 'WARRANTY_ONLY',
        redirectUrl: `/w/${unit.qr_code || unit.serial_number}`,
      });
    }

    // 2. Check if identifier is a Phone Number or Order Number
    // Clean phone number (strip spaces, dashes)
    const rawDigits = clean.replace(/[^0-9]/g, '');
    const phoneCandidates = [
      clean,
      clean.startsWith('+91') ? clean : `+91${rawDigits.slice(-10)}`,
      rawDigits.slice(-10),
    ];

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone: { in: phoneCandidates } },
          { customer_number: clean },
          { orders: { some: { order_number: clean } } },
        ],
      },
      include: {
        orders: { take: 1, orderBy: { created_at: 'desc' } },
      },
    });

    if (customer) {
      // Generate active portal access token
      const tokenRes = generateAccessToken('PORTAL');
      await prisma.customerAccessLink.create({
        data: {
          customer_id: customer.id,
          scope: 'PORTAL',
          token_hash: tokenRes.tokenHash,
          expires_at: tokenRes.expiresAt,
        },
      });

      return NextResponse.json({
        success: true,
        type: 'CUSTOMER',
        redirectUrl: `/portal/${tokenRes.rawToken}`,
        customerName: customer.name,
      });
    }

    // 3. Not found
    return NextResponse.json(
      {
        error:
          'No solar installation or customer record found for this number or serial. Please check your number or enter your hardware QR code.',
      },
      { status: 404 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to authenticate customer portal request.' },
      { status: 500 }
    );
  }
}

