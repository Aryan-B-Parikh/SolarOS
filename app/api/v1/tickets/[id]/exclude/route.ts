import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { excludeTicketWarranty } from '@/services/tickets';

/**
 * FR-7.7 — warranty exclusion now REQUIRES photo evidence.
 * Local schema (supersedes the shared ExcludeWarrantySchema, which cannot be
 * modified): reason + photoAttachmentId referencing an attachment uploaded via
 * POST /api/v1/uploads with entityType TICKET and entityId = ticket id.
 */
const ExcludeWarrantyWithEvidenceSchema = z.object({
  reason: z.string().min(3, 'Exclusion reason is required'),
  photoAttachmentId: z.string().uuid('Photo evidence attachment (UUID) is required'),
});

export const POST = createApiHandler(
  {
    bodySchema: ExcludeWarrantyWithEvidenceSchema,
    allowedRoles: ['DIRECTOR'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const ticketId = parts[parts.indexOf('tickets') + 1];

    const result = await excludeTicketWarranty(ticketId, body, user!.id);
    return NextResponse.json(result);
  }
);
