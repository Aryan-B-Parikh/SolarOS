import { NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { runSurveyPhotoAnalysis } from '@/services/assessments';
import { signedAttachmentUrl } from '@/lib/storage';
import { isAiAssessmentEnabled } from '@/services/settings';

/**
 * POST /api/v1/assessments/[leadId]/analyze-photos (FR-2.7)
 *
 * Invokes the advisory Gemini vision analysis for the lead's survey photos
 * (staff uploads read from the private attachment store) and persists the
 * findings in SiteAssessment.photo_findings.
 *
 * NOTE/LIMITATION: the vision helper only ingests photos it can fetch.
 * Survey photos live in private storage behind short-lived signed URLs, so
 * the URLs passed to the model are only usable when this deployment's base
 * URL is publicly reachable. The response reports `photosPassed`,
 * `photoUrlsExternal` and an explicit `limitation` note when the URLs are
 * relative. AI calls are additionally gated behind the
 * `ai_assessment_enabled` setting (default false).
 */
export const POST = createApiHandler(
  {
    allowedRoles: ['DIRECTOR'],
  },
  async ({ req, params, user }) => {
    const leadId = params.leadId;
    if (!leadId) throw new AppError('VALIDATION_FAILED', 'Missing leadId', 400);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { survey: true },
    });
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);
    if (!lead.survey) {
      throw new AppError('NOT_FOUND', 'Lead has no site survey to analyze', 404);
    }

    const attachments = await prisma.attachment.findMany({
      where: { owner_type: 'SURVEY', owner_id: lead.survey.id },
      orderBy: { created_at: 'asc' },
      take: 3,
    });

    // Build absolute URLs so the vision API can (attempt to) fetch them.
    const origin = new URL(req.url).origin;
    const photoUrls = attachments.map((a) => `${origin}${signedAttachmentUrl(a.id, a.storage_key)}`);

    const [findings, aiEnabled] = await Promise.all([
      runSurveyPhotoAnalysis(lead.survey.id, photoUrls, undefined, user?.id),
      isAiAssessmentEnabled(),
    ]);

    return NextResponse.json({
      success: true,
      surveyId: lead.survey.id,
      leadNumber: lead.lead_number,
      photosPassed: photoUrls.length,
      photoUrlsExternal: photoUrls.length > 0,
      aiEnabled,
      findings,
      limitation:
        photoUrls.length === 0
          ? 'No survey photos were linked to this survey yet; findings are the deterministic fallback. Upload at least one photo (owner_type SURVEY) and retry.'
          : 'Survey photos are stored privately behind short-lived signed URLs. The Gemini vision call can only fetch them if this deployment origin is publicly reachable; otherwise the deterministic "Not analysed" fallback is returned. Base64/data-URI ingestion is supported by the helper when available.',
    });
  }
);
