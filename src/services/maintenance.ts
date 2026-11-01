// Predictive maintenance rules (TRD 2.4, Automation 9, FR-8.10): a daily job
// scoring installations and raising alerts idempotently (unique per
// installation + rule + due date), plus the 30-day customer warranty reminder.

import { db } from '@/lib/db'
import { enqueue } from '@/lib/outbox'
import { istToday, addDays, toIstDateString } from '@/lib/dates'
import { getSettings } from '@/lib/settings'

export async function runMaintenanceRules() {
  const settings = await getSettings()
  const today = istToday()
  const created: string[] = []

  const installations = await db.installation.findMany({
    where: { status: 'COMPLETED' },
    include: { order: { include: { customer: true } }, warranties: { include: { unit: { include: { product: true } } } } },
  })

  for (const inst of installations) {
    const installedOn = inst.signedAt ? toIstDateString(inst.signedAt) : today

    // cleaning due every N days since install
    const lastCleaning = await db.maintenanceAlert.findFirst({
      where: { installationId: inst.id, rule: 'CLEANING_DUE', status: 'DONE' },
      orderBy: { dueOn: 'desc' },
    })
    const baseDate = lastCleaning?.dueOn ?? installedOn
    const nextCleaning = addDays(baseDate, settings.cleaningIntervalDays)
    if (nextCleaning <= today) {
      await createAlert(inst.id, 'CLEANING_DUE', nextCleaning, `Panel cleaning due (every ${settings.cleaningIntervalDays} days).`)
    }

    // repeat fault: same unit 2+ tickets in 90 days
    const unitIds = inst.warranties.map((w) => w.unitId).filter(Boolean) as string[]
    if (unitIds.length > 0) {
      const tickets = await db.serviceTicket.findMany({
        where: { unitId: { in: unitIds }, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
      })
      const byUnit = new Map<string, number>()
      for (const t of tickets) byUnit.set(t.unitId!, (byUnit.get(t.unitId!) ?? 0) + 1)
      for (const [unitId, count] of byUnit) {
        if (count >= 2) {
          await createAlert(inst.id, 'REPEAT_FAULT', today, `Unit has ${count} tickets in 90 days. Assign a senior technician.`, unitId ?? undefined, 80)
        }
      }
    }

    // battery age: off-grid battery older than 18 months
    for (const w of inst.warranties) {
      if (w.unit?.product.category === 'BATTERY') {
        const ageDays = Math.round((Date.now() - new Date(w.startDate + 'T00:00:00').getTime()) / 86400000)
        if (ageDays >= 18 * 30) {
          await createAlert(inst.id, 'BATTERY_AGE', today, 'Off-grid battery older than 18 months. Schedule a health check.', w.unitId ?? undefined, 60)
        }
      }
    }

    // pre-monsoon check: one alert per year per installation, raised from May,
    // due on June 1 (Gujarat monsoon arrives mid-June). Idempotent via the
    // unique (installation, rule, dueOn) key.
    const monsoonDueOn = `${today.slice(0, 4)}-06-01`
    if (today.slice(5, 7) >= '05' && installedOn <= addDays(today, -180)) {
      await createAlert(inst.id, 'PRE_MONSOON', monsoonDueOn, 'Pre-monsoon check: mountings, earthing, drainage and lightning arrester before the rains.')
    }

    // warranty ending: 60-day sales AMC offer + 30-day customer reminder
    for (const w of inst.warranties) {
      if (w.status !== 'ACTIVE') continue
      const daysToEnd = Math.round((new Date(w.endDate + 'T00:00:00').getTime() - Date.now()) / 86400000)
      if (daysToEnd <= 60 && daysToEnd > 30) {
        await createAlert(inst.id, 'WARRANTY_ENDING_SALES', w.endDate, `${w.unit?.product.name ?? 'Equipment'} warranty ends ${w.endDate}. Offer an annual maintenance contract.`)
      }
      if (daysToEnd <= settings.warrantyReminderDays && daysToEnd >= 0) {
        await createAlert(inst.id, 'WARRANTY_REMINDER_CUSTOMER', w.endDate, `${w.unit?.product.name ?? 'Equipment'} warranty ends in ${daysToEnd} day(s).`, w.unitId ?? undefined, 40)
        await enqueue({
          channel: 'SMS',
          recipient: inst.order.customer.phone.slice(0, 6) + 'XXXX' + inst.order.customer.phone.slice(-3),
          template: 'WARRANTY_REMINDER',
          payload: { to: inst.order.customer.phone, name: inst.order.customer.name, product: w.unit?.product.name, endDate: w.endDate },
        })
      }
    }
  }

  async function createAlert(installationId: string, rule: string, dueOn: string, reason: string, unitId?: string, riskScore = 50) {
    const existing = await db.maintenanceAlert.findUnique({
      where: { installationId_rule_dueOn: { installationId, rule, dueOn } },
    })
    if (existing) return
    await db.maintenanceAlert.create({ data: { installationId, rule, dueOn, reason, unitId: unitId ?? null, riskScore } })
    created.push(rule)
  }

  return { created, installationsChecked: installations.length, today }
}

export async function listMaintenanceAlerts() {
  return db.maintenanceAlert.findMany({
    where: { status: 'OPEN' },
    include: { installation: { include: { order: { include: { customer: true } } } } },
    orderBy: [{ riskScore: 'desc' }, { dueOn: 'asc' }],
  })
}
