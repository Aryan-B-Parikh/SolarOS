/**
 * SunPower Ops - Commissioning Certificate data & PDF (FR-6.6, Rule D11)
 *
 * Shared server-side module for the public certificate page and its PDF
 * download route. Loads the real installation record behind a certificate
 * token (or customer portal token) and renders a matching A4 PDF via the
 * shared pdf helper - no demo/fallback values anywhere.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/access-links';
import { formatDateIST } from '@/lib/dates';
import { storage } from '@/lib/storage';
import {
  createPdfDocument,
  drawSection,
  drawTable,
  type PdfCompanyBlock,
} from '@/lib/pdf';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findCertificateInstallation(where: Prisma.InstallationWhereInput) {
  return prisma.installation.findFirst({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      order: {
        include: {
          customer: true,
        },
      },
      crew_lead: { select: { id: true, name: true } },
      inventory_units: { include: { product: true } },
      warranties: { include: { unit: { include: { product: true } } } },
      signature_attachment: true,
    },
  });
}

export type CertificateInstallation = NonNullable<
  Awaited<ReturnType<typeof findCertificateInstallation>>
>;

export interface CertificateData {
  installation: CertificateInstallation;
  /** Deterministic certificate number derived from the commissioned order. */
  certificateNumber: string;
  /** True once the job is signed off (status COMPLETED with a signature). */
  issued: boolean;
}

/**
 * Resolves a certificate from:
 *  1. the 90-day CERTIFICATE access token issued at sign-off, or
 *  2. a raw installation UUID (internal preview), or
 *  3. a valid customer PORTAL link (the customer's latest signed-off job).
 * Returns null when nothing valid matches.
 */
export async function loadCertificate(rawToken: string): Promise<CertificateData | null> {
  if (!rawToken) return null;
  try {
    const tokenHash = hashToken(rawToken);
    const isUuid = UUID_RE.test(rawToken);

    let installation = await findCertificateInstallation({
      OR: [
        { certificate_token_hash: tokenHash },
        ...(isUuid ? [{ id: rawToken }] : []),
      ],
    });

    // A customer portal link may also open the customer's handover certificate
    // once the installation has been completed and signed off.
    if (!installation) {
      const link = await prisma.customerAccessLink.findUnique({
        where: { token_hash: tokenHash },
        select: {
          customer_id: true,
          scope: true,
          expires_at: true,
          revoked_at: true,
        },
      });

      if (
        link &&
        link.scope === 'PORTAL' &&
        !link.revoked_at &&
        new Date(link.expires_at).getTime() > Date.now()
      ) {
        installation = await findCertificateInstallation({
          order: { customer_id: link.customer_id },
          OR: [{ status: 'COMPLETED' }, { signed_at: { not: null } }],
        });
      }
    }

    if (!installation) return null;

    return {
      installation,
      certificateNumber: `${installation.order.order_number}-CERT`,
      issued:
        installation.status === 'COMPLETED' && installation.signed_at !== null,
    };
  } catch {
    return null;
  }
}

/** Company branding from the Setting table (same source as the quote PDF). */
async function getCompanyBlock(): Promise<PdfCompanyBlock> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'company_name',
          'company_address',
          'company_gstin',
          'company_phone',
          'company_email',
        ],
      },
    },
  });
  const getSetting = (k: string, def: string) => {
    const s = settings.find((item) => item.key === k);
    const v: unknown = (s?.value as { value?: unknown } | undefined)?.value ?? s?.value;
    return typeof v === 'string' && v.length ? v : def;
  };

  return {
    companyName: getSetting('company_name', 'SunPower Solar Systems Pvt Ltd'),
    companyAddress: getSetting('company_address', 'Gujarat, India'),
    companyGstin: getSetting('company_gstin', ''),
    companyPhone: getSetting('company_phone', ''),
    companyEmail: getSetting('company_email', ''),
  };
}

/**
 * Builds the A4 commissioning certificate PDF: certificate number, customer,
 * capacity, commissioning date, serial registry and warranty summary.
 */
export async function buildCertificatePdf(data: CertificateData): Promise<Buffer> {
  const inst = data.installation;
  const order = inst.order;
  const customer = order.customer;
  const company = await getCompanyBlock();

  const capacityKw = inst.installed_capacity_kw ? Number(inst.installed_capacity_kw) : null;
  const testReadingW = inst.test_reading_w ? Number(inst.test_reading_w) : null;
  const signedAt = inst.signed_at ? formatDateIST(inst.signed_at) : '-';
  const systemType = order.system_type ? String(order.system_type).replace('_', ' ') : '';

  const { doc, finish } = createPdfDocument({
    title: 'Certificate of Installation & Commissioning',
    company,
    metaLines: [
      ['Certificate No.', data.certificateNumber],
      ['Issue date', signedAt],
      ['Customer', customer.name],
      ['Phone', customer.phone],
      [
        'Site address',
        `${customer.address}, ${customer.city}, ${customer.state} ${customer.pincode}`,
      ],
      ['Order ref', order.order_number],
      [
        'System',
        capacityKw != null ? `${capacityKw} kW ${systemType}` : systemType || '-',
      ],
      ['Commissioning date', signedAt],
      [
        'Generation test',
        testReadingW != null ? `${testReadingW.toLocaleString('en-IN')} W` : '-',
      ],
      ['Crew lead', inst.crew_lead?.name || '-'],
    ],
  });

  // ── Certified hardware serial registry ───────────────────────────────────
  drawTable(
    doc,
    [
      { key: 'component', header: 'Component', width: 235 },
      { key: 'serial', header: 'Serial Number', width: 165 },
      { key: 'warranty', header: 'Warranty', width: 99, align: 'right' },
    ],
    inst.inventory_units.length > 0
      ? inst.inventory_units.map((unit) => ({
          component: unit.product.name,
          serial: unit.serial_number,
          warranty:
            unit.product.warranty_months > 0 ? `${unit.product.warranty_months} months` : '-',
        }))
      : [{ component: 'No serialized units recorded', serial: '-', warranty: '-' }]
  );

  // ── Warranty summary ─────────────────────────────────────────────────────
  const warrantyLines =
    inst.warranties.length > 0
      ? inst.warranties.map((w) => {
          const scope =
            w.coverage === 'WORKMANSHIP'
              ? 'Full system workmanship'
              : w.unit
              ? `${w.unit.product.name}${w.unit.serial_number ? ` (SN ${w.unit.serial_number})` : ''}`
              : 'Equipment';
          return `${String(w.coverage)} · ${scope} · ${w.months} months · ${formatDateIST(
            w.start_date
          )} to ${formatDateIST(w.end_date)} (${String(w.status)})`;
        })
      : ['No warranty records recorded for this installation.'];

  let y = drawSection(doc, 'Warranty Summary', warrantyLines);

  // ── Customer acceptance & proof ──────────────────────────────────────────
  y = drawSection(
    doc,
    'Customer Acceptance & Proof',
    [
      `Signed by: ${inst.signed_name || '-'}`,
      `Signed on: ${signedAt}`,
      `SHA-256 proof hash: ${inst.signoff_hash || '-'}`,
    ],
    y + 4
  );

  // ── Signature image (when the sign-off uploaded one) ─────────────────────
  const signature = inst.signature_attachment;
  if (signature && signature.mime.startsWith('image/')) {
    try {
      const bytes = await storage.get(signature.storage_key);
      doc.image(bytes, 400, y + 10, { width: 120 });
      doc.font('Helvetica').fontSize(7.5).fill('#64748B')
        .text('Customer digital signature', 400, y + 110, { width: 120, align: 'center' });
    } catch {
      // Missing/unreadable object - the textual acceptance block still stands
    }
  }

  return finish();
}
