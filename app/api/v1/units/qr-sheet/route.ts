import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import prisma from '@/lib/db';
import { createPdfDocument, pdfResponseHeaders } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req }) => {
    const url = new URL(req.url);
    const receiptId = url.searchParams.get('receiptId');
    const unitIdsParam = url.searchParams.get('unitIds');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '24', 10)));

    let units: any[] = [];

    if (unitIdsParam) {
      const ids = unitIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
      units = await prisma.inventoryUnit.findMany({
        where: { id: { in: ids } },
        include: { product: true },
        take: 100,
      });
    } else if (receiptId) {
      units = await prisma.inventoryUnit.findMany({
        where: { receipt_line: { receipt_id: receiptId } },
        include: { product: true },
        take: 100,
      });
    } else {
      units = await prisma.inventoryUnit.findMany({
        include: { product: true },
        orderBy: { created_at: 'desc' },
        take: limit,
      });
    }

    const { doc, finish } = createPdfDocument({
      title: 'SunPower Unit QR Label Sheet',
      subject: 'Serialized Hardware Labels',
      company: {
        companyName: 'SunPower Solar Operations',
        companyAddress: 'Ahmedabad, Gujarat 380054',
        companyGstin: '24AAACT1234A1Z5',
        companyPhone: '+91 79 4000 1234',
        companyEmail: 'ops@sunpower.internal',
      },
    });

    doc.fontSize(16).fillColor('#0f172a').text('SunPower Hardware QR Label Sheet', { align: 'center' });
    doc.fontSize(9).fillColor('#64748b').text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
    doc.moveDown(1);

    // Render a grid of label cards (2 columns x 4 rows per page)
    const cols = 2;
    const colWidth = 260;
    const rowHeight = 90;
    const startX = 35;
    let startY = 85;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const col = i % cols;
      const row = Math.floor((i % 8) / cols);

      if (i > 0 && i % 8 === 0) {
        doc.addPage();
        startY = 40;
      }

      const x = startX + col * (colWidth + 15);
      const y = startY + row * (rowHeight + 12);

      // Label card border
      doc.roundedRect(x, y, colWidth, rowHeight, 4).strokeColor('#cbd5e1').stroke();

      // SunPower brand watermark tag
      doc.fontSize(7).fillColor('#d97706').text('SUNPOWER SOLAR ASSET', x + 10, y + 8);
      
      // QR Code text / box
      doc.roundedRect(x + 10, y + 20, 55, 55, 3).fillColor('#f8fafc').fillAndStroke('#e2e8f0');
      doc.fontSize(6).fillColor('#475569').text('SCAN QR', x + 18, y + 36);
      doc.fontSize(6).text(unit.qr_code, x + 12, y + 46);

      // Details
      doc.fontSize(10).fillColor('#0f172a').text(unit.qr_code, x + 72, y + 20);
      doc.fontSize(8).fillColor('#334155').text(`S/N: ${unit.serial_number}`, x + 72, y + 35);
      doc.fontSize(7).fillColor('#64748b').text(`SKU: ${unit.product.sku}`, x + 72, y + 48);
      doc.fontSize(7).fillColor('#64748b').text(unit.product.name.slice(0, 32), x + 72, y + 60);
    }

    const pdfBuffer = await finish();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        ...pdfResponseHeaders(`qr-sheet-${Date.now()}.pdf`),
        'Content-Length': String(pdfBuffer.length),
      },
    });
  }
);

