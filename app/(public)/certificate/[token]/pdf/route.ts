import { NextRequest, NextResponse } from 'next/server';
import { pdfResponseHeaders } from '@/lib/pdf';
import { buildCertificatePdf, loadCertificate } from '../certificate-data';

export const dynamic = 'force-dynamic';

/**
 * Commissioning certificate PDF (FR-6.6 / Rule D11).
 *
 * Public but token-gated: reachable with the same certificate / portal token
 * that opens the HTML certificate page (the "Download PDF" button links here
 * via `/certificate/<token>?pdf=1`). Generates a real A4 PDF containing the
 * certificate number, customer, capacity, commissioning date, serial registry
 * and warranty summary.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const cert = await loadCertificate(params.token);

  if (!cert) {
    return NextResponse.json(
      {
        error: {
          code: 'LINK_NOT_FOUND',
          message: 'Invalid or expired certificate link.',
        },
      },
      { status: 404 }
    );
  }

  if (!cert.issued) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_ISSUED',
          message: 'The certificate has not been issued yet - the installation is not signed off.',
        },
      },
      { status: 404 }
    );
  }

  const buffer = await buildCertificatePdf(cert);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: pdfResponseHeaders(`${cert.certificateNumber}.pdf`),
  });
}
