// Surveys & assessments service (C2, FR-2.x): scheduling, mobile survey form,
// manager approval that unlocks quoting, calculator + AI summary (advisory only, D7)
// and optional vision-model photo observations (FR-2.7).

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit, enqueue } from '@/lib/outbox'
import { getSettings } from '@/lib/settings'
import { calculateAssessment, paybackYears } from '@/domain/assessment'
import { previewBom } from '@/services/quotes'
import { SURVEY_TRANSITIONS, SurveyStatus } from '@/domain/state-machines'

export async function scheduleSurvey(leadId: string, input: { surveyorId: string; scheduledAt: string }, actorId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { customer: true } })
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.')
  if (lead.status !== 'QUALIFIED' && lead.status !== 'SURVEY_SCHEDULED') {
    throw new AppError('INVALID_TRANSITION', 'Only qualified leads can have a survey scheduled.')
  }
  const survey = await db.siteSurvey.create({
    data: { leadId, surveyorId: input.surveyorId, status: 'SCHEDULED', scheduledAt: new Date(input.scheduledAt) },
  })
  await db.lead.update({ where: { id: leadId }, data: { status: 'SURVEY_SCHEDULED' } })
  await db.leadActivity.create({
    data: { leadId, type: 'SYSTEM', body: `Site survey scheduled for ${new Date(input.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`, actorId },
  })
  await enqueue({
    channel: 'SMS',
    recipient: lead.customer.phone.slice(0, 6) + 'XXXX' + lead.customer.phone.slice(-3),
    template: 'SURVEY_SCHEDULED',
    payload: { to: lead.customer.phone, name: lead.customer.name, when: input.scheduledAt },
  })
  return survey
}

export async function saveSurvey(surveyId: string, patch: {
  roofType?: string; azimuthDeg?: number; tiltDeg?: number; usableAreaSqm?: number
  shading?: string; cableDistanceM?: number; structureHeightM?: number
}, actorId: string) {
  const survey = await db.siteSurvey.findUnique({ where: { id: surveyId } })
  if (!survey) throw new AppError('NOT_FOUND', 'Survey not found.')
  if (survey.status !== 'SCHEDULED' && survey.status !== 'COMPLETED') {
    throw new AppError('INVALID_TRANSITION', 'This survey can no longer be edited.')
  }
  return db.siteSurvey.update({ where: { id: surveyId }, data: patch })
}

export async function completeSurvey(surveyId: string, actorId: string) {
  const survey = await db.siteSurvey.findUnique({ where: { id: surveyId }, include: { lead: { include: { customer: true } } } })
  if (!survey) throw new AppError('NOT_FOUND', 'Survey not found.')
  const { assertTransition } = await import('@/domain/state-machines')
  assertTransition(SURVEY_TRANSITIONS, survey.status as SurveyStatus, 'COMPLETED', 'This survey')
  const required = survey.roofType && survey.azimuthDeg != null && survey.tiltDeg != null && survey.usableAreaSqm != null && survey.shading
  if (!required) throw new AppError('VALIDATION_FAILED', 'Fill roof type, direction, tilt, usable area and shading before submitting.')
  const photos = await db.attachment.count({ where: { ownerType: 'SURVEY', ownerId: surveyId, kind: 'SURVEY' } })
  if (photos < 1) throw new AppError('PHOTOS_REQUIRED', 'Upload at least one roof photo before submitting the survey.')
  await db.siteSurvey.update({ where: { id: surveyId }, data: { status: 'COMPLETED', completedAt: new Date() } })
  // push survey measurements onto the lead for the assessment
  await db.lead.update({
    where: { id: survey.leadId },
    data: { roofAreaSqm: survey.usableAreaSqm },
  })
  await db.leadActivity.create({ data: { leadId: survey.leadId, type: 'SYSTEM', body: 'Survey submitted by the technician and is awaiting manager approval.', actorId } })
  return db.siteSurvey.findUnique({ where: { id: surveyId } })
}

export async function reviewSurvey(surveyId: string, decision: 'APPROVED' | 'REJECTED', actorId: string, reason?: string) {
  const survey = await db.siteSurvey.findUnique({ where: { id: surveyId }, include: { lead: { include: { customer: true } } } })
  if (!survey) throw new AppError('NOT_FOUND', 'Survey not found.')
  if (survey.status !== 'COMPLETED') throw new AppError('INVALID_TRANSITION', 'Only completed surveys can be reviewed.')
  if (decision === 'REJECTED' && !reason) throw new AppError('VALIDATION_FAILED', 'A rejection reason is required.')
  await db.siteSurvey.update({
    where: { id: surveyId },
    data: { status: decision, reviewedBy: actorId, rejectionReason: decision === 'REJECTED' ? reason : null },
  })
  if (decision === 'APPROVED') {
    await db.lead.update({ where: { id: survey.leadId }, data: { status: 'SURVEY_APPROVED' } })
    await db.leadActivity.create({ data: { leadId: survey.leadId, type: 'SYSTEM', body: 'Survey approved. A quotation can now be sent.', actorId } })
    await enqueue({
      channel: 'SMS',
      recipient: survey.lead.customer.phone.slice(0, 6) + 'XXXX' + survey.lead.customer.phone.slice(-3),
      template: 'SURVEY_APPROVED',
      payload: { to: survey.lead.customer.phone, name: survey.lead.customer.name },
    })
  } else {
    await db.lead.update({ where: { id: survey.leadId }, data: { status: 'QUALIFIED' } })
    await db.leadActivity.create({ data: { leadId: survey.leadId, type: 'SYSTEM', body: `Survey rejected: ${reason}. A re-survey can be booked.`, actorId } })
  }
  await audit({ actorType: 'USER', actorId, entityType: 'survey', entityId: surveyId, action: `review_${decision.toLowerCase()}`, after: { reason } })
}

// ── Assessment ───────────────────────────────────────────────────

export interface AiSummaryResult {
  summary: string
  risks: string[]
  confidence: string
  model: string | null
  fallback: boolean
}

const PROMPT_VERSION = 'v1.1-assessment'

export async function runAssessment(leadId: string, actorId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { surveys: { orderBy: { scheduledAt: 'desc' } } } })
  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.')
  const settings = await getSettings()
  const survey = lead.surveys.find((s) => s.status === 'APPROVED') ?? lead.surveys[0]

  const result = calculateAssessment({
    monthlyBillPaise: lead.monthlyBillPaise,
    monthlyUnits: lead.monthlyUnits,
    tariffPaise: lead.tariffPaise ?? settings.defaultTariffPaise,
    roofAreaSqm: lead.roofAreaSqm ?? 100,
    shading: (survey?.shading ?? 'NONE') as 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH',
    sanctionedLoadKw: lead.sanctionedLoadKw,
    requestedCapacityKw: lead.requestedCapacityKw,
    yieldKwhPerKwpPerDay: settings.yieldKwhPerKwpPerDay,
    roofAreaPerKwSqm: settings.roofAreaPerKwSqm,
    shadingFactors: settings.shadingFactors,
  })

  const ai = settings.aiEnabled ? await aiSummary(result, survey?.shading) : fallbackSummary(result)

  // FR-2.5: payback estimate against the indicative price of the matching active
  // template (net of the indicative subsidy). Kept as an estimate — the quote's
  // real payback is shown on the quote itself.
  let payback: number | null = null
  try {
    const template = await db.systemTemplate.findFirst({
      where: { isActive: true, capacityKw: result.recommendedKw, systemType: result.recommendedType },
    })
    if (template && result.annualSavingsPaise > 0) {
      const estimate = await previewBom(template.code, result.recommendedKw, survey?.cableDistanceM ?? null)
      const { subsidyEstimateFor } = await import('@/services/quotes')
      payback = computePayback(estimate.totalPaise, subsidyEstimateFor(result.recommendedKw), result.annualSavingsPaise)
      if (payback !== null) payback = Math.round(payback * 10) / 10
    }
  } catch {
    payback = null // estimation only — never blocks the assessment
  }

  const assessment = await db.siteAssessment.create({
    data: {
      leadId,
      surveyId: survey?.id ?? null,
      inputs: JSON.stringify({ bill: lead.monthlyBillPaise, units: lead.monthlyUnits, tariff: lead.tariffPaise, roofArea: lead.roofAreaSqm, shading: survey?.shading ?? 'NONE' }),
      recommendedKw: result.recommendedKw,
      recommendedType: result.recommendedType,
      annualGenerationKwh: result.annualGenerationKwh,
      annualSavingsPaise: result.annualSavingsPaise,
      paybackYears: payback,
      flags: result.flags.join(','),
      aiSummary: ai.summary,
      aiRisks: JSON.stringify(ai.risks),
      aiModel: ai.model,
      promptVersion: PROMPT_VERSION,
    },
  })
  await db.leadActivity.create({
    data: { leadId, type: 'SYSTEM', body: `Site assessment run: ${result.recommendedKw} kW recommended (all figures are estimates). AI summary stored.`, actorId },
  })
  return { assessment, result, ai }
}

async function aiSummary(result: ReturnType<typeof calculateAssessment>, shading: string | null): Promise<AiSummaryResult> {
  try {
    const facts = {
      recommendedKw: result.recommendedKw,
      requiredKw: result.requiredKw,
      roofLimitKw: result.roofLimitKw,
      annualGenerationKwh: result.annualGenerationKwh,
      annualSavingsInr: Math.round(result.annualSavingsPaise / 100),
      monthlyUnits: result.monthlyUnits,
      shading,
      flags: result.flags,
    }
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content:
              'You are a solar energy advisor for a residential solar company in Gujarat, India. You receive ONLY calculator outputs from a sizing engine. You never change numbers. Reply with strict JSON: {"summary": string (2-3 sentences, plain language for the homeowner, mention figures as estimates), "risks": string[] (0-3 short risk flags), "confidence": "HIGH"|"MEDIUM"|"LOW"}. No markdown, JSON only.',
          },
          { role: 'user', content: JSON.stringify(facts) },
        ],
        thinking: { type: 'disabled' },
      }),
      timeout,
    ])) as { choices: { message: { content: string } }[] }

    const raw = completion.choices[0]?.message?.content ?? ''
    const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonText) as { summary: string; risks: string[]; confidence: string }
    if (!parsed.summary) throw new Error('empty summary')
    return {
      summary: parsed.summary,
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [],
      confidence: parsed.confidence ?? 'MEDIUM',
      model: 'glm-4.6-assessment',
      fallback: false,
    }
  } catch {
    return fallbackSummary(result)
  }
}

function fallbackSummary(result: ReturnType<typeof calculateAssessment>): AiSummaryResult {
  const inr = (p: number) => 'Rs ' + Math.round(p / 100).toLocaleString('en-IN')
  const summary = `Based on your electricity consumption and available roof space, a ${result.recommendedKw} kW system is recommended; estimated annual generation is about ${Math.round(result.annualGenerationKwh).toLocaleString('en-IN')} kWh and estimated annual savings are approximately ${inr(result.annualSavingsPaise)}. Your roof measurements and sanctioned load should be verified before final approval.`
  const risks: string[] = []
  if (result.flags.includes('ROOF_TOO_SMALL')) risks.push('Roof area limits the system size')
  if (result.flags.includes('ABOVE_SANCTIONED_LOAD')) risks.push('Requested capacity exceeds the sanctioned load')
  if (result.flags.includes('HEAVY_SHADING')) risks.push('Heavy shading reduces expected generation')
  return { summary, risks, confidence: 'MEDIUM', model: null, fallback: true }
}

/** Advisory roof-photo observations (FR-2.7): never changes a calculated number. */
export async function runPhotoAnalysis(surveyId: string, actorId: string) {
  const settings = await getSettings()
  const photos = await db.attachment.findMany({ where: { ownerType: 'SURVEY', ownerId: surveyId, kind: 'SURVEY' } })
  const survey = await db.siteSurvey.findUnique({ where: { id: surveyId } })
  if (!survey) throw new AppError('NOT_FOUND', 'Survey not found.')
  if (!settings.photoAnalysisEnabled || photos.length === 0) {
    await db.siteSurvey.update({ where: { id: surveyId }, data: {} })
    return { findings: null, status: 'Not analysed' as const, reason: photos.length === 0 ? 'No survey photos to analyse.' : 'Photo analysis is disabled in settings.' }
  }
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
    const first = photos[0]
    const fileBuffer = await fs.readFile(path.join(process.cwd(), first.storageKey))
    const dataUrl = `data:${first.mime};base64,${fileBuffer.toString('base64')}`
    const completion = (await Promise.race([
      (zai.chat.completions as any).createVision({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are analysing a rooftop photo for a solar site survey. Reply with strict JSON: {"observations": string[] (visible shading sources, obstructions, roof type, photo quality), "confidence": "HIGH"|"MEDIUM"|"LOW"}. Advisory only. JSON only.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      }),
      timeout,
    ])) as { choices: { message: { content: string } }[] }
    const raw = completion.choices[0]?.message?.content ?? ''
    const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonText) as { observations: string[]; confidence: string }
    const findings = { observations: parsed.observations?.slice(0, 5) ?? [], confidence: parsed.confidence ?? 'LOW', analysedAt: new Date().toISOString() }
    await db.siteAssessment.updateMany({
      where: { surveyId },
      data: { photoFindings: JSON.stringify(findings), photoModel: 'glm-4.5v-photo' },
    })
    return { findings, status: 'Analysed' as const, reason: null }
  } catch {
    return { findings: null, status: 'Not analysed' as const, reason: 'Photo analysis is unavailable right now; the approval does not depend on it.' }
  }
}

export function computePayback(quoteTotalPaise: number, subsidyPaise: number, annualSavingsPaise: number) {
  return paybackYears(quoteTotalPaise, subsidyPaise, annualSavingsPaise)
}
