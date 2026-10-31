import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateAccessToken } from '@/lib/access-links';

/**
 * Public portal lookup (D11 hardening):
 *
 * 1. Resolve the customer by QR code / serial number / phone / customer
 *    number / order number.
 * 2. NEVER return a portal link straight away - the caller must first pass
 *    the "last 4 digits of the registered phone" challenge. Without this,
 *    anyone knowing a phone or serial could walk into the customer portal.
 * 3. A fresh link is a NEW row - previously issued links are never rotated
 *    (they keep working until their own expiry or explicit revocation).
 * 4. 5 wrong verification attempts lock this identifier for 15 minutes.
 */

const MAX_VERIFY_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const verifyAttempts = new Map<string, { count: number; lockedUntil: number }>();

function isLocked(key: string): boolean {
  const rec = verifyAttempts.get(key);
  return !!rec && rec.lockedUntil > Date.now();
}

function recordFailure(key: string): void {
  const rec = verifyAttempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_VERIFY_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MINUTES * 60000;
    rec.count = 0;
  }
  verifyAttempts.set(key, rec);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return `••••• ${digits.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
    const phoneLastFour = typeof body?.phoneLastFour === 'string' ? body.phoneLastFour : '';

    if (!identifier) {
      return NextResponse.json(
        { error: 'Please enter your registered phone number, inverter serial number, or QR code.' },
        { status: 400 }
      );
    }

    if (isLocked(identifier)) {
      return NextResponse.json(
        { error: `Too many incorrect attempts. Please try again in ${LOCK_MINUTES} minutes.` },
        { status: 429 }
      );
    }

    // ── 1. Resolve the customer ─────────────────────────────────────────────
    const unit = await prisma.inventoryUnit.findFirst({
      where: { OR: [{ qr_code: identifier }, { serial_number: identifier }] },
      include: { customer: true },
    });

    let customer = unit?.customer ?? null;

    if (!customer) {
      // Not a serial/QR: try phone / customer number / order number
      const rawDigits = identifier.replace(/[^0-9]/g, '');
      const phoneCandidates = [
        identifier,
        identifier.startsWith('+91') ? identifier : `+91${rawDigits.slice(-10)}`,
        rawDigits.slice(-10),
      ];
      customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { phone: { in: phoneCandidates } },
            { customer_number: identifier },
            { orders: { some: { order_number: identifier } } },
          ],
        },
      });
    }

    // Hardware exists but is not yet linked to a customer: public warranty
    // registry only (no personal data).
    if (!customer && unit) {
      return NextResponse.json({
        success: true,
        type: 'WARRANTY_ONLY',
        redirectUrl: `/w/${unit.qr_code || unit.serial_number}`,
      });
    }

    if (!customer) {
      // Uniform response - no account enumeration
      return NextResponse.json(
        {
          error:
            'No solar installation or customer record found for this number or serial. Please check your number or enter your hardware QR code.',
        },
        { status: 404 }
      );
    }

    // ── 2. Phone last-4 verification challenge (D11) ───────────────────────
    if (!phoneLastFour) {
      return NextResponse.json({
        success: true,
        requiresVerification: true,
        maskedPhone: maskPhone(customer.phone),
        message: `For security, please confirm the last 4 digits of the registered phone number (${maskPhone(customer.phone)}).`,
      });
    }

    const expected = customer.phone.replace(/\D/g, '').slice(-4);
    if (phoneLastFour.replace(/\D/g, '') !== expected) {
      recordFailure(identifier);
      return NextResponse.json(
        { error: 'Verification digits do not match our records. Please check and try again.' },
        { status: 403 }
      );
    }

    // Verified: issue a NEW portal link (existing links are never rotated)
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to authenticate customer portal request.' },
      { status: 500 }
    );
  }
}
