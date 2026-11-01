// Minimal Google Gemini client — direct REST calls to the Generative Language
// API, no SDK (T4: AI bill scan). The API key lives only in env vars
// (GEMINI_API_KEY, AI_API_KEY fallback) and is never logged or echoed back.

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
  }[]
}

/**
 * Google retires old flash models over time (1.5 → 2.0 → 2.5 → …). If the
 * AI_MODEL configured in .env has been retired upstream (HTTP 404 "not found"
 * / "no longer available") we retry with these newer aliases before failing,
 * so a stale env var cannot kill the feature. The model actually used is
 * reported back to callers (and to the client) for transparency.
 */
export const GEMINI_MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash']

/** GEMINI_API_KEY first, AI_API_KEY fallback (never logged, never returned). */
export function geminiApiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim()
  return key.length > 0 ? key : null
}

export function geminiModel(): string {
  return (process.env.AI_MODEL || '').trim() || 'gemini-1.5-flash'
}

export function isGeminiConfigured(): boolean {
  return geminiApiKey() !== null
}

async function generateContentOnce(model: string, parts: GeminiPart[]): Promise<string> {
  const key = geminiApiKey()
  if (!key) throw new Error('Gemini is not configured (missing API key).')
  const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
    method: 'POST',
    // key goes in the header — never in the URL/query where it could leak into logs
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0, 200)}`)
  let data: GeminiResponse
  try {
    data = JSON.parse(raw) as GeminiResponse
  } catch {
    throw new Error(`Gemini ${res.status}: ${raw.slice(0, 200)}`)
  }
  const out = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
  if (!out.trim()) throw new Error('Gemini returned no content')
  return out
}

function isModelRetired(err: unknown): boolean {
  // upstream 404s: "models/X is not found …" / "no longer available"
  return err instanceof Error && err.message.startsWith('Gemini 404:')
}

async function generateContent(parts: GeminiPart[]): Promise<{ text: string; model: string }> {
  const models = [...new Set([geminiModel(), ...GEMINI_MODEL_FALLBACKS])]
  let lastErr: unknown = null
  for (const model of models) {
    try {
      return { text: await generateContentOnce(model, parts), model }
    } catch (e) {
      lastErr = e
      if (!isModelRetired(e)) throw e // only model-not-found falls through to the next candidate
    }
  }
  throw lastErr ?? new Error('Gemini returned no content')
}

/** Vision call with the used model reported (e.g. for the API response). */
export async function geminiVisionDetailed(opts: { base64: string; mimeType: string; prompt: string }): Promise<{ text: string; model: string }> {
  return generateContent([
    { text: opts.prompt },
    { inline_data: { mime_type: opts.mimeType, data: opts.base64 } },
  ])
}

/** Vision call: prompt + one inline (base64) image. */
export async function geminiVision(opts: { base64: string; mimeType: string; prompt: string }): Promise<string> {
  return (await geminiVisionDetailed(opts)).text
}

/** Text-only call. */
export async function geminiText(prompt: string): Promise<string> {
  return (await generateContent([{ text: prompt }])).text
}
