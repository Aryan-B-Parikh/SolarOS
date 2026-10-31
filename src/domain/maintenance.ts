/**
 * SunPower Ops - Predictive Maintenance & Risk Scoring Engine (Spec 6.3 Phase 8, TRD 2.4, Rule C12)
 * Pure domain logic for scoring installations, evaluating preventive maintenance rules,
 * detecting repeat faults and model risk, and customer warranty reminders.
 */

export type MaintenanceRule =
  | 'CLEANING_DUE'
  | 'PRE_MONSOON'
  | 'REPEAT_FAULT'
  | 'MODEL_RISK'
  | 'BATTERY_AGE'
  | 'WARRANTY_EXPIRING_SALES'
  | 'WARRANTY_REMINDER_CUSTOMER';

export interface MaintenanceAlertCandidate {
  installationId: string;
  unitId?: string | null;
  rule: MaintenanceRule;
  riskScore: number; // 0 to 100
  dueOn: string; // YYYY-MM-DD
  reason: string;
}

export interface UnitInspectionData {
  id: string;
  productId: string;
  model: string;
  category: string;
  serialNumber: string;
  deliveredOn?: Date | string | null;
  activeWarranty?: {
    id: string;
    endDate: string; // YYYY-MM-DD
  } | null;
  ticketCountIn90Days: number;
}

export interface InstallationEvaluationContext {
  installationId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  systemType: 'ON_GRID' | 'OFF_GRID' | 'HYBRID';
  installedOn: Date | string; // Date of sign-off / finished_at or scheduled_on
  lastCleaningOn?: Date | string | null;
  units: UnitInspectionData[];
  modelFailureRates?: Record<string, number>; // model -> failure rate (0 to 1)
}

/**
 * Evaluates predictive maintenance rules for a single active installation at referenceDate.
 */
export function evaluateInstallationMaintenanceRules(
  ctx: InstallationEvaluationContext,
  referenceDate: Date = new Date()
): MaintenanceAlertCandidate[] {
  const alerts: MaintenanceAlertCandidate[] = [];
  const refDateStr = referenceDate.toISOString().split('T')[0];
  const refTime = referenceDate.getTime();
  const installTime = new Date(ctx.installedOn).getTime();
  const daysSinceInstall = Math.floor((refTime - installTime) / (86400 * 1000));

  // 1. CLEANING_DUE: 90 days since install or last cleaning
  const lastCleanTime = ctx.lastCleaningOn ? new Date(ctx.lastCleaningOn).getTime() : installTime;
  const daysSinceCleaning = Math.floor((refTime - lastCleanTime) / (86400 * 1000));
  if (daysSinceCleaning >= 90) {
    alerts.push({
      installationId: ctx.installationId,
      rule: 'CLEANING_DUE',
      riskScore: 25,
      dueOn: refDateStr,
      reason: `${daysSinceCleaning} days since last panel cleaning (threshold: 90 days). Preventive visit recommended.`,
    });
  }

  // 2. PRE_MONSOON: Every May (month 5 in 1-based, 4 in 0-based), all active installations
  // In IST, May is month index 4 in JS UTC/Local
  const istMonth = new Date(refTime + 5.5 * 3600 * 1000).getUTCMonth(); // 4 = May
  if (istMonth === 4) {
    alerts.push({
      installationId: ctx.installationId,
      rule: 'PRE_MONSOON',
      riskScore: 40,
      dueOn: refDateStr,
      reason: 'Annual pre-monsoon inspection campaign for active solar installations.',
    });
  }

  // Evaluate unit-specific rules
  for (const unit of ctx.units) {
    // 3. REPEAT_FAULT: Same unit has 2 or more tickets in 90 days
    if (unit.ticketCountIn90Days >= 2) {
      alerts.push({
        installationId: ctx.installationId,
        unitId: unit.id,
        rule: 'REPEAT_FAULT',
        riskScore: 75,
        dueOn: refDateStr,
        reason: `Unit ${unit.serialNumber} (${unit.model}) has ${unit.ticketCountIn90Days} service tickets in the past 90 days. High-risk flag for senior technician.`,
      });
    }

    // 4. MODEL_RISK: Model failure rate above threshold (threshold >= 0.15 / 15%)
    if (ctx.modelFailureRates && ctx.modelFailureRates[unit.model] !== undefined) {
      const rate = ctx.modelFailureRates[unit.model];
      if (rate >= 0.15) {
        alerts.push({
          installationId: ctx.installationId,
          unitId: unit.id,
          rule: 'MODEL_RISK',
          riskScore: 50,
          dueOn: refDateStr,
          reason: `Model ${unit.model} exhibits elevated failure rate of ${(rate * 100).toFixed(1)}% across deployed base.`,
        });
      }
    }

    // 5. BATTERY_AGE: Off-grid / Hybrid battery older than 18 months (548 days)
    if ((ctx.systemType === 'OFF_GRID' || ctx.systemType === 'HYBRID') && (unit.category === 'BATTERY' || unit.category === 'STORAGE')) {
      const unitDeliveryTime = unit.deliveredOn ? new Date(unit.deliveredOn).getTime() : installTime;
      const batteryAgeDays = Math.floor((refTime - unitDeliveryTime) / (86400 * 1000));
      if (batteryAgeDays >= 548) {
        alerts.push({
          installationId: ctx.installationId,
          unitId: unit.id,
          rule: 'BATTERY_AGE',
          riskScore: 60,
          dueOn: refDateStr,
          reason: `Off-grid battery unit ${unit.serialNumber} age is ${batteryAgeDays} days (exceeds 18 months). Preventive health-check alert.`,
        });
      }
    }

    // Warranty expiration alerts
    if (unit.activeWarranty) {
      const warrantyEndTime = new Date(unit.activeWarranty.endDate).getTime();
      const daysUntilExpiry = Math.floor((warrantyEndTime - refTime) / (86400 * 1000));

      // 6. WARRANTY_EXPIRING_SALES: 60 days before warranty end date (within 60 days, e.g. 31 to 60 days)
      if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
        alerts.push({
          installationId: ctx.installationId,
          unitId: unit.id,
          rule: 'WARRANTY_EXPIRING_SALES',
          riskScore: 30,
          dueOn: refDateStr,
          reason: `Equipment warranty for unit ${unit.serialNumber} ends on ${unit.activeWarranty.endDate} (${daysUntilExpiry} days remaining). Offer Annual Maintenance Contract (AMC).`,
        });
      }

      // 7. WARRANTY_REMINDER_CUSTOMER: Exactly within 30 days before warranty end date
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        alerts.push({
          installationId: ctx.installationId,
          unitId: unit.id,
          rule: 'WARRANTY_REMINDER_CUSTOMER',
          riskScore: 20,
          dueOn: refDateStr,
          reason: `Warranty reminder for unit ${unit.serialNumber}: ${daysUntilExpiry} days remaining until ${unit.activeWarranty.endDate}. Automated reminder queued.`,
        });
      }
    }
  }

  return alerts;
}

/**
 * Calculates aggregate risk score (0 to 100) from active alerts for an installation.
 */
export function calculateAggregateRiskScore(alerts: MaintenanceAlertCandidate[]): number {
  if (!alerts.length) return 0;
  // Maximum individual risk score plus diminishing returns for additional alerts
  const sortedScores = alerts.map((a) => a.riskScore).sort((a, b) => b - a);
  let totalScore = sortedScores[0];

  for (let i = 1; i < sortedScores.length; i++) {
    totalScore += sortedScores[i] * 0.25;
  }

  return Math.min(100, Math.round(totalScore));
}

