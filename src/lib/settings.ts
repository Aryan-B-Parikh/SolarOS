// Settings service: business settings live in the settings table so the director
// can change them without a deploy (TRD 2.10). These are the seeded defaults.

import { db } from '@/lib/db'

export interface BusinessSettings {
  companyName: string
  gstin: string
  address: string
  phone: string
  email: string
  bankDetails: string
  advancePct: number             // Q1: 30
  targetMarginBp: number         // FR-3.8: 2000 = 20%
  salesDiscountLimitBp: number   // Q5: 500 = 5%
  yieldKwhPerKwpPerDay: number   // A8: 4.5
  roofAreaPerKwSqm: number       // A8: 10
  shadingFactors: Record<string, number> // NONE 1.00, LOW 0.95, MEDIUM 0.85, HIGH 0.70
  defaultTariffPaise: number     // Rs 7 / kWh
  quoteValidityDays: number      // 15
  slaHoursByPriority: Record<string, number> // LOW 168, NORMAL 72, HIGH 24, URGENT 4
  crewWeights: { skill: number; proximity: number; workload: number; continuity: number }
  cleaningIntervalDays: number   // 90
  duplicateAddressThreshold: number // 0.72
  businessStartHour: number      // 9 — lead SLA clock (FR-1.6)
  businessEndHour: number        // 19
  businessDays: number[]         // ISO weekdays 0=Sun…6=Sat the team works
  warrantyReminderDays: number   // 30 (customer), 60 (sales AMC)
  aiEnabled: boolean
  photoAnalysisEnabled: boolean
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  companyName: 'SunPower Solar Energy Pvt Ltd',
  gstin: '24ABCDE1234F1Z5',
  address: 'Plot 14, GIDC Estate, Phase II, Vatva, Ahmedabad, Gujarat 382445',
  phone: '+91 79 4000 1234',
  email: 'hello@sunpower.example',
  bankDetails: 'HDFC Bank A/C 50100234567891, IFSC HDFC0000123',
  advancePct: 30,
  targetMarginBp: 2000,
  salesDiscountLimitBp: 500,
  yieldKwhPerKwpPerDay: 4.5,
  roofAreaPerKwSqm: 10,
  shadingFactors: { NONE: 1.0, LOW: 0.95, MEDIUM: 0.85, HIGH: 0.7 },
  defaultTariffPaise: 700,
  quoteValidityDays: 15,
  slaHoursByPriority: { LOW: 168, NORMAL: 72, HIGH: 24, URGENT: 4 },
  crewWeights: { skill: 0.4, proximity: 0.25, workload: 0.2, continuity: 0.15 },
  cleaningIntervalDays: 90,
  duplicateAddressThreshold: 0.72,
  businessStartHour: 9,
  businessEndHour: 19,
  businessDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  warrantyReminderDays: 30,
  aiEnabled: true,
  photoAnalysisEnabled: true,
}

const KEY = 'business'

export async function getSettings(): Promise<BusinessSettings> {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  if (!row) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(patch: Partial<BusinessSettings>, updatedBy: string): Promise<BusinessSettings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next), updatedBy },
    update: { value: JSON.stringify(next), updatedBy },
  })
  return next
}
