// T4: public AI bill scan — photo of an Indian electricity bill → extracted
// usage + an authoritative server-side solar system size suggestion.
// Called by the public enquiry form (#/e) before submission; strictly
// progressive enhancement — the form works fully without it.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { rateLimit } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { geminiVisionDetailed, isGeminiConfigured } from '@/lib/gemini'

const MAX_DECODED_BYTES = 3 * 1024 * 1024 // 3 MB

const schema = z
  .object({
    // base64 length ≈ decoded bytes × 4/3 → ~4M chars for 3MB
    imageBase64: z.string().min(64).max(4_200_000),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  })
  .superRefine((v, ctx) => {
    if (Math.floor(v.imageBase64.length * 0.75) > MAX_DECODED_BYTES) {
      ctx.addIssue({ code: 'custom', path: ['imageBase64'], message: 'Image is too large — please upload a photo under 3 MB.' })
    }
  })

const PROMPT =
  'You are reading an Indian electricity bill photo. Extract: monthlyUnits (kWh consumed this billing period, number), ' +
  'billAmount (INR, number), tariff (slab/category text if visible), consumerName, billingDays if visible. ' +
  'Return ONLY minified JSON: {"monthlyUnits":number|null,"billAmount":number|null,"tariff":string|null,' +
  '"consumerName":string|null,"billingDays":number|null}. If a field is unreadable use null.'

/** Catalogue sizes we actually sell — suggestions snap up to the nearest one. */
const CATALOGUE_KW = [1, 2, 3, 5, 7.5, 10]

/**
 * Authoritative sizing: daily need = units / 30 days; array kW = daily / 4.2
 * peak-sun-hours; round to the nearest 0.5 (min 1 kW), then snap UP to the
 * smallest catalogue size that fits. 320 units → 2.54 → 3.0 → 3 kW.
 */
export function suggestSystemKw(monthlyUnits: number | null): number | null {
  if (monthlyUnits == null || !(monthlyUnits > 0)) return null
  let kw = Math.ceil((monthlyUnits / 30 / 4.2) * 2) / 2
  if (kw < 1) kw = 1
  const snapped = CATALOGUE_KW.find((s) => s >= kw)
  return snapped ?? kw
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  // public + paid upstream: tight per-IP limit
  if (!rateLimit('ai-bill-scan:' + ip, 10, 60_000)) {
    throw new AppError('RATE_LIMITED', 'Too many bill scans. Please try again in a minute.')
  }
  return handlerWithSchema(req, schema, async ({ body }) => {
    if (!isGeminiConfigured()) {
      throw new AppError('AI_UNAVAILABLE', 'Bill scanning is not available right now. Please fill the form manually.')
    }

    let reply: string
    let usedModel: string
    try {
      const out = await geminiVisionDetailed({ base64: body.imageBase64, mimeType: body.mimeType, prompt: PROMPT })
      reply = out.text
      usedModel = out.model
    } catch (e) {
      // propagate the upstream message (e.g. "Gemini 401: API key not valid")
      // so the UI toast can show it — the form stays usable without the scan
      throw new AppError('AI_UNAVAILABLE', e instanceof Error ? e.message : 'Bill scan failed.')
    }

    // strip ```json fences / prose, then parse
    const cleaned = reply.replace(/```(?:json)?/gi, '').trim()
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
        } catch {
          parsed = null
        }
      }
    }
    if (!parsed) {
      return { extractError: 'Could not parse bill', raw: reply.slice(0, 200) }
    }

    const monthlyUnits = num(parsed.monthlyUnits)
    const billAmount = num(parsed.billAmount)
    const billingDays = num(parsed.billingDays)

    return {
      monthlyUnits,
      billAmount,
      tariff: str(parsed.tariff),
      consumerName: str(parsed.consumerName),
      billingDays,
      suggestedKw: suggestSystemKw(monthlyUnits),
      model: usedModel,
    }
  })
}
