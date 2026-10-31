import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { getSettings, setSetting } from '@/services/settings';

/**
 * Settings keys managed on Screen S21 (FR-9.2). Key names follow
 * prisma/seed.ts where seeded (`target_margin_bp`, `sla_hours_by_priority`,
 * `advance_threshold_percent`, `company_branding`); the flat `company_*`
 * keys are what the branded PDF export reads.
 */
export const MANAGED_SETTING_KEYS = [
  'company_name',
  'company_address',
  'company_gstin',
  'company_bank_details',
  'company_phone',
  'company_email',
  'sla_hours_by_priority',
  'target_margin_bp',
  'advance_threshold_percent',
  'ai_assessment_enabled',
] as const;

const SettingsPayloadSchema = z.object({
  settings: z.record(
    z.enum(MANAGED_SETTING_KEYS),
    z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.union([z.string(), z.number()]))])
  ),
});

/** Default values used when a key has never been stored (mirrors seed.ts). */
const DEFAULTS: Record<string, unknown> = {
  company_name: 'SunPower Solar Energy Pvt Ltd',
  company_address: '402 Solar Tower, S.G. Highway, Ahmedabad, Gujarat 380054',
  company_gstin: '24AAACS1429B1Z8',
  company_bank_details: 'HDFC Bank, S.G. Highway Branch, A/C: 50200012345678, IFSC: HDFC0001234',
  company_phone: '+91 79 4000 1234',
  company_email: 'ops@sunpowersolar.in',
  sla_hours_by_priority: { LOW: 168, NORMAL: 72, HIGH: 24, URGENT: 4 },
  target_margin_bp: 2000,
  advance_threshold_percent: 30,
  ai_assessment_enabled: false,
};

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR'],
  },
  async () => {
    const values = await getSettings([...MANAGED_SETTING_KEYS], DEFAULTS as any);

    // Fall back to the seeded `company_branding` object for unset flat keys.
    const branding = await getSettings(['company_branding'], {});
    const brandingObj = (branding['company_branding'] as Record<string, unknown>) || {};
    const flat: Record<string, string> = {
      company_name: String(values['company_name'] ?? ''),
      company_address: String(values['company_address'] ?? ''),
      company_gstin: String(values['company_gstin'] ?? ''),
      company_bank_details: String(values['company_bank_details'] ?? ''),
      company_phone: String(values['company_phone'] ?? ''),
      company_email: String(values['company_email'] ?? ''),
    };
    const brandingFallback: Record<string, string> = {
      company_name: 'companyName',
      company_address: 'address',
      company_gstin: 'gstin',
      company_bank_details: 'bankDetails',
      company_phone: 'phone',
      company_email: 'email',
    };
    for (const [key, prop] of Object.entries(brandingFallback)) {
      if (!flat[key]) {
        const v = brandingObj[prop];
        flat[key] = typeof v === 'string' && v ? v : String(DEFAULTS[key]);
      }
    }

    return NextResponse.json({
      settings: {
        ...flat,
        sla_hours_by_priority: values['sla_hours_by_priority'] ?? DEFAULTS.sla_hours_by_priority,
        target_margin_bp: values['target_margin_bp'] ?? DEFAULTS.target_margin_bp,
        advance_threshold_percent: values['advance_threshold_percent'] ?? DEFAULTS.advance_threshold_percent,
        ai_assessment_enabled: values['ai_assessment_enabled'] ?? DEFAULTS.ai_assessment_enabled,
      },
    });
  }
);

export const PUT = createApiHandler(
  {
    bodySchema: SettingsPayloadSchema,
    allowedRoles: ['DIRECTOR'],
  },
  async ({ body, user }) => {
    const updated: Record<string, unknown> = {};

    // setSetting upserts each key and records an audit entry
    // (entityType 'setting', before/after values) per change.
    for (const [key, value] of Object.entries(body.settings)) {
      await setSetting(key, value, user?.id);
      updated[key] = value;
    }

    return NextResponse.json({ success: true, updated });
  }
);
