/**
 * SunPower Ops - Public Warranty Lookup Service (Spec 6.3 Phase 5, TRD 2.4, ADR D5)
 * Secure, zero-PII equipment verification for customers scanning physical QR codes or entering serial numbers.
 */

import { prisma } from '@/lib/db';
import { evaluateWarrantyEligibility, WarrantyVerdict } from '@/domain/warranty';

export interface PublicWarrantyResponse {
  isFound: boolean;
  verdict: WarrantyVerdict;
  productName?: string;
  brand?: string;
  model?: string;
  category?: string;
  serialNumber?: string;
  qrCode?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  remainingDays?: number;
  months?: number;
  isCovered?: boolean;
}

/**
 * Looks up equipment warranty information by QR code or serial number.
 * Strictly redacts and excludes all customer personal information (D11, C7).
 */
export async function getPublicWarrantyInfo(codeOrSerial: string): Promise<PublicWarrantyResponse> {
  const query = codeOrSerial.trim();
  if (!query) {
    return {
      isFound: false,
      verdict: 'UNKNOWN_UNIT',
    };
  }

  // Look up physical unit by QR code or serial number
  const unit = await prisma.inventoryUnit.findFirst({
    where: {
      OR: [
        { qr_code: { equals: query, mode: 'insensitive' } },
        { serial_number: { equals: query, mode: 'insensitive' } },
      ],
    },
    include: {
      product: true,
      warranties: {
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });

  if (!unit) {
    return {
      isFound: false,
      verdict: 'UNKNOWN_UNIT',
    };
  }

  const latestWarranty = unit.warranties[0];

  if (!latestWarranty) {
    return {
      isFound: true,
      verdict: 'OUT_OF_WARRANTY',
      productName: unit.product.name,
      brand: unit.product.brand,
      model: unit.product.model,
      category: unit.product.category,
      serialNumber: unit.serial_number,
      qrCode: unit.qr_code,
      status: unit.status,
      remainingDays: 0,
      isCovered: false,
    };
  }

  const startDateIso = latestWarranty.start_date.toISOString().split('T')[0];
  const endDateIso = latestWarranty.end_date.toISOString().split('T')[0];

  const eligibility = evaluateWarrantyEligibility({
    testDate: new Date(),
    startDate: startDateIso,
    endDate: endDateIso,
    status: latestWarranty.status as any,
  });

  return {
    isFound: true,
    verdict: eligibility.verdict,
    productName: unit.product.name,
    brand: unit.product.brand,
    model: unit.product.model,
    category: unit.product.category,
    serialNumber: unit.serial_number,
    qrCode: unit.qr_code,
    status: latestWarranty.status,
    startDate: startDateIso,
    endDate: endDateIso,
    remainingDays: eligibility.remainingDays,
    months: latestWarranty.months,
    isCovered: eligibility.isCovered,
  };
}

