import PDFDocument from 'pdfkit';

/**
 * Shared PDF generation helpers (FR-3.5, FR-6.6, FR-8.6, FR-8.7, FR-10.5, FR-10.8).
 * Server-side only (Node runtime). pdfkit is marked external in next.config.mjs.
 */

export interface PdfCompanyBlock {
  companyName: string;
  companyAddress?: string;
  companyGstin?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyBank?: string;
}

export interface PdfTableColumn {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface PdfTableRow {
  [key: string]: string | number | undefined;
}

const PAGE_W = 595.28; // A4 @ 72dpi
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Creates an A4 PDF document with the standard SunPower layout. */
export function createPdfDocument(options: {
  title: string;
  company: PdfCompanyBlock;
  metaLines?: Array<[string, string]>;
  subject?: string;
}): { doc: PDFKit.PDFDocument; finish: () => Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => buffers.push(chunk));

  const finish = () =>
    new Promise<Buffer>((resolve) => {
      // Stamp footer on every page before closing the stream
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 30;
        doc.font('Helvetica').fontSize(7).fill('#94A3B8')
          .text(
            `${options.company.companyName || 'SunPower Solar Systems'}${
              options.company.companyGstin ? ` - GSTIN ${options.company.companyGstin}` : ''
            } - Page ${i - range.start + 1} of ${range.count}`,
            MARGIN,
            bottom,
            { width: CONTENT_W, align: 'center', lineBreak: false }
          );
      }
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.end();
    });

  // ── Header band ──────────────────────────────────────────────────────────
  doc.roundedRect(MARGIN, MARGIN - 16, CONTENT_W, 76, 6).fill('#0F172A');
  doc.fill('#F59E0B').font('Helvetica-Bold').fontSize(18)
    .text(options.company.companyName || 'SunPower Solar Systems', MARGIN + 16, MARGIN - 6);
  const sub: string[] = [];
  if (options.company.companyAddress) sub.push(options.company.companyAddress);
  if (options.company.companyGstin) sub.push(`GSTIN: ${options.company.companyGstin}`);
  if (options.company.companyPhone) sub.push(`Ph: ${options.company.companyPhone}`);
  if (sub.length) {
    doc.fill('#CBD5E1').font('Helvetica').fontSize(8)
      .text(sub.join('  |  '), MARGIN + 16, MARGIN + 20, { width: CONTENT_W - 32 });
  }
  if (options.company.companyEmail) {
    doc.fill('#CBD5E1').font('Helvetica').fontSize(8)
      .text(options.company.companyEmail, MARGIN + 16, MARGIN + 32, { width: CONTENT_W - 32 });
  }

  // ── Title + meta ─────────────────────────────────────────────────────────
  let y = MARGIN + 84;
  doc.fill('#0F172A').font('Helvetica-Bold').fontSize(15).text(options.title, MARGIN, y);
  y += 24;

  if (options.metaLines?.length) {
    doc.font('Helvetica').fontSize(9);
    for (const [label, value] of options.metaLines) {
      doc.fill('#64748B').text(`${label}:`, MARGIN, y, { continued: false });
      doc.fill('#0F172A').text(String(value ?? ''), MARGIN + 110, y, { width: CONTENT_W - 110 });
      y += 13;
    }
    y += 6;
  }

  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#E2E8F0').stroke();
  y += 14;

  (doc as any).__cursorY = y;

  return { doc, finish };
}

/** Restores the running y cursor on the doc (internal helper). */
export function cursorY(doc: PDFKit.PDFDocument): number {
  return (doc as any).__cursorY ?? (doc.y || 72);
}

export function setCursorY(doc: PDFKit.PDFDocument, y: number): void {
  (doc as any).__cursorY = y;
}

/** Draws a simple table. Returns the y cursor after the table. */
export function drawTable(
  doc: PDFKit.PDFDocument,
  columns: PdfTableColumn[],
  rows: PdfTableRow[],
  options: { startY?: number; fontSize?: number } = {}
): number {
  const fontSize = options.fontSize ?? 9;
  let y = options.startY ?? cursorY(doc);

  const drawHeader = () => {
    doc.rect(MARGIN, y, CONTENT_W, 18).fill('#1E293B');
    let x = MARGIN + 6;
    doc.font('Helvetica-Bold').fontSize(fontSize).fill('#FFFFFF');
    for (const col of columns) {
      doc.text(col.header, x, y + 5, { width: col.width - 12, align: col.align || 'left' });
      x += col.width;
    }
    y += 18;
  };

  drawHeader();

  doc.font('Helvetica').fontSize(fontSize);
  let zebra = false;
  for (const row of rows) {
    const cellTexts = columns.map(
      (c) => (row[c.key] === undefined || row[c.key] === null ? '' : String(row[c.key]))
    );
    const rowH = Math.max(
      16,
      ...cellTexts.map((t) => doc.heightOfString(t, { width: CONTENT_W - 12 }) + 8)
    );

    if (y + rowH > doc.page.height - 60) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
      doc.font('Helvetica').fontSize(fontSize);
    }

    if (zebra) {
      doc.rect(MARGIN, y, CONTENT_W, rowH).fill('#F1F5F9');
    }
    zebra = !zebra;

    let x = MARGIN + 6;
    doc.fill('#0F172A');
    cellTexts.forEach((t, i) => {
      doc.text(t, x, y + 4, { width: columns[i].width - 12, align: columns[i].align || 'left' });
      x += columns[i].width;
    });
    y += rowH;
  }
  return y;
}

/** Draws a right-aligned totals block (label + amount rows). */
export function drawTotals(
  doc: PDFKit.PDFDocument,
  lines: Array<{ label: string; value: string; bold?: boolean; accent?: boolean }>,
  startY?: number
): number {
  let y = startY ?? cursorY(doc);
  y += 6;
  const labelX = PAGE_W - MARGIN - 250;
  for (const line of lines) {
    if (line.bold) doc.font('Helvetica-Bold');
    else doc.font('Helvetica');
    doc.fontSize(line.bold ? 11 : 9.5);
    doc.fill(line.accent ? '#0F172A' : '#475569').text(line.label, labelX, y, { width: 160 });
    doc.fill('#0F172A').text(line.value, PAGE_W - MARGIN - 90, y, { width: 90, align: 'right' });
    y += line.bold ? 18 : 14;
  }
  return y;
}

/** Writes a key-value section with a small heading. */
export function drawSection(
  doc: PDFKit.PDFDocument,
  heading: string,
  bodyLines: string[],
  startY?: number
): number {
  let y = startY ?? cursorY(doc);
  doc.font('Helvetica-Bold').fontSize(10.5).fill('#0F172A').text(heading, MARGIN, y);
  y += 16;
  doc.font('Helvetica').fontSize(9).fill('#334155');
  for (const line of bodyLines) {
    doc.text(line, MARGIN, y, { width: CONTENT_W });
    y += 13;
  }
  return y + 8;
}

/** Rupees formatting for PDFs. */
export function inr(amount: string | number | bigint): string {
  const n = typeof amount === 'bigint' ? Number(amount) : Number(amount);
  const rupees = Math.round(n) / 100;
  return `Rs. ${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Standard PDF HTTP response headers. */
export function pdfResponseHeaders(filename: string): Record<string, string> {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename.replace(/[^\w.\-]+/g, '_')}"`,
    'Cache-Control': 'private, no-store',
  };
}
