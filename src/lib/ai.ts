/**
 * SunPower Ops - AI Site Assessment & Vision Summary Client
 * Specification Reference: TRD 2.4, PRD 1.6, Implementation Plan Phase 2
 *
 * Rules:
 * 1. The LLM receives ONLY calculator outputs and technical survey fields.
 *    STRICT PRIVACY: Never send customer name, phone, email, or exact address.
 * 2. Returns JSON with customer summary, risks list, and confidence level.
 * 3. Enforces an 8-second timeout.
 * 4. Deterministic templated fallback on timeout, API error, or missing API key.
 * 5. Prompt version and Model ID are recorded for auditability.
 * 6. Advisory photo analysis receives photos only and returns observations.
 *    It is strictly advisory and NEVER alters calculator numbers or survey approval.
 */

export const AI_PROMPT_VERSION = '1.1.0';
export const DEFAULT_AI_MODEL = 'gemini-1.5-flash';
export const AI_TIMEOUT_MS = 8000;

export interface AiAssessmentInput {
  recommendedCapacityKw: number;
  yearlyGenerationKwh: number;
  yearlySavingsRs: number;
  monthlyUnitsKwh: number;
  roofType?: string;
  roofDirection?: string;
  roofTiltDeg?: number;
  usableRoofAreaM2?: number;
  shadingLevel?: string;
  cableDistanceM?: number;
}

export interface AiAssessmentSummary {
  summary: string;
  risks: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  modelId: string;
  promptVersion: string;
  fallbackUsed: boolean;
}

export interface PhotoAnalysisResult {
  shadingSources: string[];
  obstructions: string[];
  roofType: string;
  photoQuality: 'CLEAR' | 'ACCEPTABLE' | 'BLURRY' | 'POOR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  isAdvisory: true;
  fallbackUsed: boolean;
}

/**
 * Deterministic templated fallback matching TRD 2.4 tone.
 */
export function generateFallbackSummary(input: AiAssessmentInput): AiAssessmentSummary {
  const kw = input.recommendedCapacityKw;
  const savings = input.yearlySavingsRs.toLocaleString('en-IN');
  const generation = input.yearlyGenerationKwh.toLocaleString('en-IN');

  const summary = `Based on your electricity consumption and available roof space, a ${kw} kW system is recommended; estimated annual generation is approximately ${generation} kWh, yielding estimated annual savings of approximately Rs ${savings}. Your roof measurements and sanctioned load should be verified before final approval.`;

  const risks: string[] = [];
  if (input.shadingLevel && input.shadingLevel !== 'NONE') {
    risks.push(`Potential shading detected (${input.shadingLevel}); micro-inverters or string optimizer may be considered.`);
  }
  if (!input.usableRoofAreaM2 || input.usableRoofAreaM2 < kw * 10) {
    risks.push('Usable roof area is close to the minimum required threshold (10 m² per kW). Physical survey verification required.');
  }
  if (input.cableDistanceM && input.cableDistanceM > 35) {
    risks.push(`Long cable distance (${input.cableDistanceM} m) may induce higher DC line voltage drops.`);
  }
  if (risks.length === 0) {
    risks.push('Standard installation conditions. Final grid sanction and structural roof stability to be confirmed by survey.');
  }

  return {
    summary,
    risks,
    confidence: 'MEDIUM',
    modelId: 'system-template-fallback',
    promptVersion: AI_PROMPT_VERSION,
    fallbackUsed: true,
  };
}

/**
 * Fallback for advisory photo analysis.
 */
export function generateFallbackPhotoAnalysis(): PhotoAnalysisResult {
  return {
    shadingSources: ['Not analysed'],
    obstructions: ['Not analysed'],
    roofType: 'Not analysed',
    photoQuality: 'ACCEPTABLE',
    confidence: 'LOW',
    isAdvisory: true,
    fallbackUsed: true,
  };
}

/**
 * Generates an AI summary for a site assessment with strict timeout and fallback.
 */
export async function generateSiteAssessmentSummary(
  input: AiAssessmentInput,
  apiKey?: string
): Promise<AiAssessmentSummary> {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (!key) {
    return generateFallbackSummary(input);
  }

  // Create an abort controller for the strict 8-second timeout rule
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    // Construct sanitized payload without PII
    const systemPrompt = `You are an expert technical solar engineering assistant for SunPower.
Generate a structured JSON assessment summary for the homeowner based on technical parameters.
RULES:
1. Do not invent or change any figures (recommended kW: ${input.recommendedCapacityKw}, generation: ${input.yearlyGenerationKwh} kWh, savings: Rs ${input.yearlySavingsRs}).
2. Return strictly a JSON object with:
   "summary": string (professional, reassuring customer-facing explanation),
   "risks": array of strings (technical risk flags like shading, cable distance, roof orientation),
   "confidence": "HIGH" | "MEDIUM" | "LOW"
3. Tone: Clear, transparent, stating all figures are estimates pending technical survey approval.`;

    // Simulated LLM call structure with timeout guard
    // In production, fetch Google Gemini or OpenAI endpoint here using key
    // If external network is inaccessible or errors, catch falls back cleanly
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: systemPrompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return generateFallbackSummary(input);
    }

    const json = await response.json() as any;
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return generateFallbackSummary(input);
    }

    const parsed = JSON.parse(rawText);
    if (!parsed.summary || !Array.isArray(parsed.risks)) {
      return generateFallbackSummary(input);
    }

    return {
      summary: parsed.summary,
      risks: parsed.risks,
      confidence: parsed.confidence === 'HIGH' || parsed.confidence === 'LOW' ? parsed.confidence : 'MEDIUM',
      modelId: DEFAULT_AI_MODEL,
      promptVersion: AI_PROMPT_VERSION,
      fallbackUsed: false,
    };
  } catch {
    clearTimeout(timeoutId);
    return generateFallbackSummary(input);
  }
}

/**
 * Advisory photo analysis wrapper.
 */
export async function analyzeSurveyPhotos(
  photoUrls: string[],
  apiKey?: string
): Promise<PhotoAnalysisResult> {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (!key || photoUrls.length === 0) {
    return generateFallbackPhotoAnalysis();
  }

  // Vision analysis would be invoked here; falls back cleanly if no service is reachable
  return generateFallbackPhotoAnalysis();
}

