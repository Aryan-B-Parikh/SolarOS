import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { validateTransition } from '@/domain/state-machines/transitions';
import { calculateSiteAssessment } from '@/domain/assessment';
import { rupeesToPaise } from '@/lib/money';
import { SurveyStatus, LeadStatus, RoofType, ShadingLevel, LeadActivityType } from '@prisma/client';

export async function scheduleSurvey(
  leadId: string,
  data: { surveyorId?: string; scheduledAt: string | Date },
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);

    validateTransition('LEAD', lead.status, 'SURVEY_SCHEDULED');

    const scheduledDate = new Date(data.scheduledAt);

    // Upsert site_survey
    const survey = await tx.siteSurvey.upsert({
      where: { lead_id: leadId },
      create: {
        lead_id: leadId,
        surveyor_id: data.surveyorId || null,
        scheduled_at: scheduledDate,
        usable_area_sqm: lead.roof_area_sqm || 30,
        status: SurveyStatus.SCHEDULED,
      },
      update: {
        surveyor_id: data.surveyorId || null,
        scheduled_at: scheduledDate,
        status: SurveyStatus.SCHEDULED,
      },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: { status: LeadStatus.SURVEY_SCHEDULED },
    });

    await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        type: LeadActivityType.SURVEY_BOOKED,
        body: `Site survey scheduled for ${scheduledDate.toLocaleDateString('en-IN')}`,
        actor_id: actorId || null,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'SITE_SURVEY',
        entityId: survey.id,
        action: 'SURVEY_SCHEDULED',
        after: { scheduledAt: scheduledDate, surveyorId: data.surveyorId },
      },
      tx
    );

    return survey;
  });
}

export async function reviewSurvey(
  surveyId: string,
  action: 'APPROVE' | 'REJECT',
  reason?: string,
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const survey = await tx.siteSurvey.findUnique({
      where: { id: surveyId },
      include: { lead: true },
    });
    if (!survey) throw new AppError('NOT_FOUND', 'Survey not found', 404);

    if (action === 'APPROVE') {
      validateTransition('LEAD', survey.lead.status, 'SURVEY_APPROVED');

      const updatedSurvey = await tx.siteSurvey.update({
        where: { id: surveyId },
        data: {
          status: SurveyStatus.APPROVED,
          reviewed_by: actorId,
          reviewed_at: new Date(),
        },
      });

      await tx.lead.update({
        where: { id: survey.lead_id },
        data: { status: LeadStatus.SURVEY_APPROVED },
      });

      // Run / update assessment automatically upon survey approval
      const inputs = {
        monthlyBillRs: survey.lead.monthly_bill_paise ? Number(survey.lead.monthly_bill_paise) / 100 : 3000,
        tariffRsPerKwh: survey.lead.tariff_paise ? Number(survey.lead.tariff_paise) / 100 : 7,
        usableRoofAreaM2: Number(survey.usable_area_sqm) || 30,
        sanctionedLoadKw: Number(survey.lead.sanctioned_load_kw) || 4,
        shadingLevel: (survey.shading as any) || 'NONE',
      };
      const result = calculateSiteAssessment(inputs);

      await tx.siteAssessment.upsert({
        where: { lead_id: survey.lead_id },
        create: {
          lead_id: survey.lead_id,
          survey_id: survey.id,
          inputs: inputs as any,
          recommended_kw: result.recommendedCapacityKw,
          recommended_type: 'ON_GRID',
          annual_generation_kwh: result.yearlyGenerationKwh,
          annual_savings_paise: rupeesToPaise(result.yearlySavingsRs),
          payback_years: result.paybackYears ?? 4.5,
          flags: [],
          ai_summary: `Based on your consumption and roof space, a ${result.recommendedCapacityKw} kW on-grid solar system is recommended. Estimated annual savings are approximately Rs ${result.yearlySavingsRs.toLocaleString('en-IN')}.`,
        },
        update: {
          survey_id: survey.id,
          inputs: inputs as any,
          recommended_kw: result.recommendedCapacityKw,
          recommended_type: 'ON_GRID',
          annual_generation_kwh: result.yearlyGenerationKwh,
          annual_savings_paise: rupeesToPaise(result.yearlySavingsRs),
          payback_years: result.paybackYears ?? 4.5,
          flags: [],
          ai_summary: `Based on your consumption and roof space, a ${result.recommendedCapacityKw} kW on-grid solar system is recommended. Estimated annual savings are approximately Rs ${result.yearlySavingsRs.toLocaleString('en-IN')}.`,
        },
      });

      await tx.leadActivity.create({
        data: {
          lead_id: survey.lead_id,
          type: LeadActivityType.STATUS_CHANGE,
          body: 'Site survey approved. Quotation sending unlocked.',
          actor_id: actorId || null,
        },
      });

      return updatedSurvey;
    } else {
      // REJECT
      if (!reason) {
        throw new AppError('VALIDATION_FAILED', 'Rejection reason is required', 400);
      }

      validateTransition('LEAD', survey.lead.status, 'QUALIFIED');

      const updatedSurvey = await tx.siteSurvey.update({
        where: { id: surveyId },
        data: {
          status: SurveyStatus.REJECTED,
          reviewed_by: actorId,
          reviewed_at: new Date(),
          rejection_reason: reason,
        },
      });

      await tx.lead.update({
        where: { id: survey.lead_id },
        data: { status: LeadStatus.QUALIFIED },
      });

      await tx.leadActivity.create({
        data: {
          lead_id: survey.lead_id,
          type: LeadActivityType.STATUS_CHANGE,
          body: `Site survey rejected: ${reason}`,
          actor_id: actorId || null,
        },
      });

      return updatedSurvey;
    }
  });
}


export async function getSurveyById(surveyId: string) {
  const survey = await prisma.siteSurvey.findUnique({
    where: { id: surveyId },
    include: {
      lead: true,
      surveyor: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!survey) throw new AppError('NOT_FOUND', 'Survey not found', 404);
  return survey;
}

export async function submitSurvey(
  surveyId: string,
  data: {
    roofType: RoofType;
    azimuthDeg: number;
    tiltDeg: number;
    usableAreaSqm: number;
    shading: ShadingLevel;
    cableDistanceM: number;
    structureHeightM?: number;
    notes?: string;
    photoAttachmentIds?: string[];
  },
  actorId?: string
) {
  return prisma.$transaction(async (tx) => {
    const survey = await tx.siteSurvey.findUnique({
      where: { id: surveyId },
      include: { lead: true },
    });
    if (!survey) throw new AppError('NOT_FOUND', 'Survey not found', 404);

    const updatedSurvey = await tx.siteSurvey.update({
      where: { id: surveyId },
      data: {
        status: SurveyStatus.COMPLETED,
        completed_at: new Date(),
        roof_type: data.roofType,
        azimuth_deg: data.azimuthDeg,
        tilt_deg: data.tiltDeg,
        usable_area_sqm: data.usableAreaSqm,
        shading: data.shading,
        cable_distance_m: data.cableDistanceM,
        structure_height_m: data.structureHeightM || null,
        notes: data.notes || null,
        surveyor_id: survey.surveyor_id || actorId || null,
      },
    });

    await tx.leadActivity.create({
      data: {
        lead_id: survey.lead_id,
        type: LeadActivityType.NOTE,
        body: `Site survey completed by surveyor (${data.roofType}, ${data.usableAreaSqm} m², ${data.shading} shading)`,
        actor_id: actorId || null,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId,
        entityType: 'SITE_SURVEY',
        entityId: survey.id,
        action: 'SURVEY_COMPLETED',
        after: data,
      },
      tx
    );

    return updatedSurvey;
  });
}

