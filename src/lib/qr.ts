/**
 * SunPower Ops - QR Code Generation & Label Formatter
 * Phase 5 - Member 3: Operations Frontend
 * Spec: FR-5.4, Phase 5 (QR label sheet, QR opens public warranty page)
 */

export function generateQRCodeURL(qrCode: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000';
  return `${base}/w/${encodeURIComponent(qrCode)}`;
}

export interface QRLabel {
  serialNumber: string;
  qrCode: string;
  qrUrl: string;
  productName: string;
  sku: string;
  receiptDate?: string;
}

export function generateLabels(
  units: { serialNumber: string; qrCode: string; productName: string; sku: string }[],
  receiptDate?: string,
  baseUrl?: string
): QRLabel[] {
  return units.map((u) => ({
    serialNumber: u.serialNumber,
    qrCode: u.qrCode,
    qrUrl: generateQRCodeURL(u.qrCode, baseUrl),
    productName: u.productName,
    sku: u.sku,
    receiptDate: receiptDate || new Date().toISOString().split('T')[0],
  }));
}

/**
 * Generates clean, high-density SVG QR representation or printable label sheet HTML
 */
export function generateLabelSheetHTML(labels: QRLabel[]): string {
  const labelCards = labels
    .map(
      (label) => `
    <div style="width: 60mm; height: 40mm; border: 1px dashed #94a3b8; padding: 3mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-family: sans-serif; page-break-inside: avoid; background: #fff;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 8pt; font-weight: bold; color: #ea580c; text-transform: uppercase; letter-spacing: 0.5px;">SunPower Solar</div>
          <div style="font-size: 7pt; color: #475569; max-width: 32mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${label.productName}</div>
        </div>
        <div style="font-size: 6pt; font-family: monospace; color: #64748b;">${label.sku}</div>
      </div>
      
      <div style="display: flex; align-items: center; justify-content: space-between; margin: 2mm 0;">
        <div style="width: 20mm; height: 20mm; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 6pt; font-family: monospace; text-align: center; background: #f8fafc;">
          QR: ${label.qrCode}
        </div>
        <div style="flex: 1; padding-left: 3mm; font-size: 6.5pt; color: #334155;">
          <div><strong>Serial:</strong></div>
          <div style="font-family: monospace; font-size: 7.5pt; font-weight: bold; color: #0f172a;">${label.serialNumber}</div>
          <div style="margin-top: 1mm; font-size: 5.5pt; color: #94a3b8;">Scan for 20-Yr Warranty</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 5.5pt; color: #94a3b8; border-top: 0.5px solid #e2e8f0; pt: 1mm;">
        <span>sunpower.solar/w</span>
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
    .label-grid { display: grid; grid-template-columns: repeat(auto-fill, 60mm); gap: 5mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="label-grid">
    ${labelCards}
  </div>
</body>
</html>`;
}
