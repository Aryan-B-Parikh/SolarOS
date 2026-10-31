/**
 * SunPower Ops - System Settings Service (FR-9.2 / Screen S21)
 *
 * Backed by the `Setting` model (key -> Json value).
 *
 * Storage convention: primitives are stored as plain JSON values
 * (e.g. `2000`, `"text"`, `true`); objects are stored as-is. Reads are
 * tolerant of both the raw shape and a legacy `{ value: ... }` wrapper:
 *   typeof v === 'string' ? v : (v as any)?.value ?? fallback
 * plus graceful handling of raw numbers / booleans / objects.
 */

import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

/** Normalizes a stored Json value into the expected type. */
function normalizeSettingValue<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  // Legacy / tolerant wrapper: { value: X }
  if (typeof raw === 'object' && !Array.isArray(raw) && 'value' in (raw as Record<string, unknown>)) {
    const inner = (raw as Record<string, unknown>).value;
    if (inner !== null && inner !== undefined) return inner as T;
    return fallback;
  }
  // Raw primitive / object stored directly.
  return raw as T;
}

/** Reads one setting; returns `fallback` when missing or unreadable. */
export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (!row) return fallback;
    return normalizeSettingValue<T>(row.value, fallback);
  } catch {
    return fallback;
  }
}

/** Reads several settings at once; missing keys map to `fallback`. */
export async function getSettings<T = unknown>(
  keys: string[],
  fallbacks: Record<string, T> = {}
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    for (const key of keys) {
      result[key] = normalizeSettingValue(byKey.get(key), fallbacks[key] as T);
    }
  } catch {
    for (const key of keys) {
      result[key] = fallbacks[key] as T;
    }
  }
  return result;
}

/** Upserts one setting and audits the change. Returns the stored value. */
export async function setSetting(key: string, value: unknown, actorId?: string): Promise<unknown> {
  const existing = await prisma.setting.findUnique({ where: { key } });
  const normalizedExisting = existing ? normalizeSettingValue<unknown>(existing.value, null) : null;

  const row = await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as any, updated_by: actorId ?? null },
    update: { value: value as any, updated_by: actorId ?? null },
  });

  await recordAudit({
    actorType: actorId ? 'USER' : 'SYSTEM',
    actorId,
    entityType: 'setting',
    entityId: key,
    action: 'SETTING_UPDATED',
    before: normalizedExisting === null ? undefined : { value: normalizedExisting },
    after: { value: normalizeSettingValue<unknown>(row.value, value) },
  });

  return normalizeSettingValue<unknown>(row.value, value);
}

/**
 * Business-facing typed helpers used across services.
 */

/** Target gross margin in basis points (FR-3.8). Default 2000 bp = 20%. */
export async function getTargetMarginBp(): Promise<number> {
  const v = await getSetting<number>('target_margin_bp', 2000);
  return Number.isFinite(v) && v > 0 ? v : 2000;
}

/** Whether AI (Gemini) assessment/vision calls are enabled (FR-2.7). Default false. */
export async function isAiAssessmentEnabled(): Promise<boolean> {
  return getSetting<boolean>('ai_assessment_enabled', false);
}

/**
 * Company branding block used by PDFs and the settings UI.
 * Reads flat `company_*` keys first (as written by the settings screen),
 * falling back to the seeded `company_branding` object (prisma/seed.ts).
 */
export async function getCompanyBranding(): Promise<{
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyBank: string;
  companyPhone: string;
  companyEmail: string;
}> {
  const flat = await getSettings<unknown>([
    'company_name',
    'company_address',
    'company_gstin',
    'company_bank_details',
    'company_phone',
    'company_email',
  ]);

  const seeded = await getSetting<Record<string, unknown>>('company_branding', {});
  const seededVal = (k: string): string => {
    const v = seeded?.[k];
    return typeof v === 'string' && v.length ? v : '';
  };

  const asString = (v: unknown, fb: string) =>
    typeof v === 'string' && v.length ? v : fb;

  return {
    companyName: asString(flat['company_name'], seededVal('companyName') || 'SunPower Solar Energy Pvt Ltd'),
    companyAddress: asString(flat['company_address'], seededVal('address') || '402 Solar Tower, S.G. Highway, Ahmedabad, Gujarat 380054'),
    companyGstin: asString(flat['company_gstin'], seededVal('gstin') || ''),
    companyBank: asString(flat['company_bank_details'], seededVal('bankDetails') || ''),
    companyPhone: asString(flat['company_phone'], seededVal('phone') || ''),
    companyEmail: asString(flat['company_email'], seededVal('email') || ''),
  };
}
