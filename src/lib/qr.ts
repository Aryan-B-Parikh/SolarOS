/**
 * SunPower Ops - QR Code Generation & Label Formatter
 * Spec: FR-5.2, FR-5.4 (real scannable QR labels; QR opens public warranty page)
 *
 * Uses the `qrcode` npm package (isomorphic: browser bundle on the client,
 * canvas/svg engine on the server) to generate real, scannable PNG QR codes
 * encoding the public warranty URL `${base}/w/${qr_code}`.
 */

import QRCode from 'qrcode';

/** Public URL a unit QR code resolves to (app/(public)/w/[code]). */
export function generateQRCodeURL(qrCode: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/w/${encodeURIComponent(qrCode)}`;
}

/**
 * Generates a REAL scannable QR code as a PNG data URL (256px, margin 1).
 * The encoded payload is the public warranty URL for the unit's qr_code.
 */
export async function generateQRCodeDataURL(qrCode: string, baseUrl?: string): Promise<string> {
  const url = generateQRCodeURL(qrCode, baseUrl);
  return QRCode.toDataURL(url, {
    type: 'image/png',
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

export interface QRLabel {
  serialNumber: string;
  qrCode: string;
  qrUrl: string;
  /** Real scannable PNG data URL of the QR code. */
  dataUrl: string;
  productName: string;
  sku: string;
  warrantyMonths: number;
  receiptDate?: string;
}

/**
 * Builds printable label descriptors for received serialized units, generating
 * a real QR PNG data URL for each one.
 */
export async function generateLabels(
  units: {
    serialNumber: string;
    qrCode: string;
    productName: string;
    sku: string;
    warrantyMonths?: number;
  }[],
  receiptDate?: string,
  baseUrl?: string
): Promise<QRLabel[]> {
  return Promise.all(
    units.map(async (u) => ({
      serialNumber: u.serialNumber,
      qrCode: u.qrCode,
      qrUrl: generateQRCodeURL(u.qrCode, baseUrl),
      dataUrl: await generateQRCodeDataURL(u.qrCode, baseUrl),
      productName: u.productName,
      sku: u.sku,
      warrantyMonths: u.warrantyMonths ?? 0,
      receiptDate: receiptDate || new Date().toISOString().split('T')[0],
    }))
  );
}

/**
 * Standalone printable label-sheet HTML (real QR images embedded as PNG data
 * URLs). Used when a label sheet needs to be opened in its own window rather
 * than rendered in-page.
 */
export function generateLabelSheetHTML(labels: QRLabel[]): string {
  const labelCards = labels
    .map(
      (label) => `
    <div style="width: 62mm; height: 42mm; border: 1px dashed #94a3b8; padding: 3mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-family: sans-serif; page-break-inside: avoid; background: #fff;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 8pt; font-weight: bold; color: #ea580c; text-transform: uppercase; letter-spacing: 0.5px;">SunPower Solar</div>
          <div style="font-size: 7pt; color: #475569; max-width: 34mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${label.productName}</div>
        </div>
        <div style="font-size: 6pt; font-family: monospace; color: #64748b;">${label.sku}</div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin: 1mm 0;">
        <img src="${label.dataUrl}" alt="QR ${label.qrCode}" style="width: 19mm; height: 19mm; display: block;" />
        <div style="flex: 1; padding-left: 3mm; font-size: 6.5pt; color: #334155;">
          <div><strong>Serial:</strong></div>
          <div style="font-family: monospace; font-size: 7.5pt; font-weight: bold; color: #0f172a;">${label.serialNumber}</div>
          <div style="margin-top: 1mm; font-size: 5.5pt; color: #94a3b8;">Warranty: ${label.warrantyMonths} months</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 5.5pt; color: #94a3b8; border-top: 0.5px solid #e2e8f0; padding-top: 1mm;">
        <span>Scan for warranty &amp; unit history</span>
        <span>${label.receiptDate || ''}</span>
      </div>
    </div>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SunPower Equipment QR Labels</title>
  <style>
    @page { size: auto; margin: 10mm; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .label-grid { display: grid; grid-template-columns: repeat(auto-fill, 62mm); gap: 5mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="label-grid">
    ${labelCards}
  </div>
</body>
</html>`;
}
