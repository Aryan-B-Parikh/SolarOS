/**
 * SunPower Ops Dates & Timezone Helper
 * Display Timezone: Asia/Kolkata (IST = UTC+5:30)
 * Storage: UTC timestamptz or IST calendar dates (YYYY-MM-DD)
 */

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns current date in IST formatted as YYYY-MM-DD
 */
export function getTodayIST(date: Date = new Date()): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().split('T')[0];
}

/**
 * Formats a Date or ISO string into IST date: "31 Oct 2026"
 */
export function formatDateIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a Date or ISO string into IST datetime: "31 Oct 2026, 02:30 PM"
 */
export function formatDateTimeIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Adds months to a calendar date string (YYYY-MM-DD) and subtracts 1 day as per warranty spec:
 * Example: start 2026-11-05 + 24 months = ends 2028-11-04
 * Handles month-end clamping (e.g. 2024-02-29, 31 Jan -> 28 Feb)
 */
export function calculateWarrantyEndDate(startDateStr: string, months: number): string {
  const [yearStr, monthStr, dayStr] = startDateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12
  const day = parseInt(dayStr, 10);

  // Target year and month
  const totalMonths = month - 1 + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  // Days in target month
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(day, daysInTargetMonth);

  // Build target date and subtract 1 day
  const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay));
  targetDate.setUTCDate(targetDate.getUTCDate() - 1);

  return targetDate.toISOString().split('T')[0];
}

/**
 * Calculates start and end of a given month in IST as UTC Date objects
 * E.g., for October 2026:
 * start: 2026-09-30T18:30:00.000Z (2026-10-01 00:00:00 IST)
 * end:   2026-10-31T18:29:59.999Z (2026-10-31 23:59:59.999 IST)
 */
export function getISTMonthRange(year: number, month: number): { start: Date; end: Date } {
  // month is 1-12
  const startIST = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endIST = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return {
    start: new Date(startIST.getTime() - IST_OFFSET_MS),
    end: new Date(endIST.getTime() - IST_OFFSET_MS),
  };
}

/**
 * Default Indian business window used for SLA maths (FR-1.6):
 * 09:00-18:00 IST, Monday-Saturday (Sunday closed).
 */
export const DEFAULT_BUSINESS_START_HOUR = 9;
export const DEFAULT_BUSINESS_END_HOUR = 18;
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Mon-Sat (0 = Sunday)

/**
 * First-contact SLA for NEW leads, in business hours (FR-1.6 / AUTO-8).
 * Kept here (pure module) so services and the node test runner can share it.
 */
export const LEAD_SLA_BUSINESS_HOURS = 4;

/**
 * Adds `hours` of business (working) time to `from`, skipping non-business
 * hours and closed days (default: 09:00-18:00 IST, Mon-Sat).
 *
 * Example: Friday 17:00 IST + 4 business hours => Saturday 12:00 IST
 * (1h on Friday, Sunday skipped, 3h on Monday would apply if Saturday closed).
 */
export function addBusinessHours(
  from: Date,
  hours: number,
  businessStart: number = DEFAULT_BUSINESS_START_HOUR,
  businessEnd: number = DEFAULT_BUSINESS_END_HOUR,
  workDays: number[] = DEFAULT_WORK_DAYS
): Date {
  if (!Number.isFinite(hours) || hours <= 0) {
    return new Date(from.getTime());
  }

  // Work in "IST wall clock" space: shift by +5:30 then use UTC accessors.
  let ist = new Date(from.getTime() + IST_OFFSET_MS);
  let remainingMs = Math.round(hours * 3600 * 1000);

  // Safety bound to avoid infinite loops on pathological inputs.
  const maxIterations = 366 * 24;
  let iterations = 0;

  while (remainingMs > 0 && iterations++ < maxIterations) {
    const dow = ist.getUTCDay();
    const timeOfDayMs =
      (ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds()) * 1000 +
      ist.getUTCMilliseconds();
    const openMs = businessStart * 3600 * 1000;
    const closeMs = businessEnd * 3600 * 1000;

    if (!workDays.includes(dow)) {
      // Closed day: jump to next midnight IST.
      ist = new Date(
        Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 0, 0, 0, 0)
      );
      continue;
    }

    if (timeOfDayMs < openMs) {
      // Before opening: jump to opening time today.
      ist = new Date(
        Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), businessStart, 0, 0, 0)
      );
      continue;
    }

    if (timeOfDayMs >= closeMs) {
      // After closing: jump to next midnight IST.
      ist = new Date(
        Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 0, 0, 0, 0)
      );
      continue;
    }

    // Inside the business window: consume as much as possible today.
    const availableTodayMs = closeMs - timeOfDayMs;
    if (remainingMs <= availableTodayMs) {
      ist = new Date(ist.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= availableTodayMs;
      ist = new Date(ist.getTime() + availableTodayMs); // == closing time
    }
  }

  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/**
 * Counts how many business (working) hours have elapsed between `from` and
 * `now` (default 09:00-18:00 IST, Mon-Sat). Time outside the business window
 * (nights, Sundays) does not count towards SLA breach maths (FR-1.6).
 */
export function businessHoursElapsedSince(
  from: Date,
  now: Date = new Date(),
  businessStart: number = DEFAULT_BUSINESS_START_HOUR,
  businessEnd: number = DEFAULT_BUSINESS_END_HOUR,
  workDays: number[] = DEFAULT_WORK_DAYS
): number {
  const fromIstMs = from.getTime() + IST_OFFSET_MS;
  const nowIstMs = now.getTime() + IST_OFFSET_MS;
  if (!Number.isFinite(fromIstMs) || !Number.isFinite(nowIstMs) || nowIstMs <= fromIstMs) {
    return 0;
  }

  let totalMs = 0;
  const dayMs = 24 * 3600 * 1000;
  const fromIst = new Date(fromIstMs);
  // Midnight IST of the `from` calendar day.
  let dayStartMs = Date.UTC(
    fromIst.getUTCFullYear(),
    fromIst.getUTCMonth(),
    fromIst.getUTCDate()
  );

  // Safety bound (~2 years of days).
  let iterations = 0;
  while (dayStartMs <= nowIstMs && iterations++ < 800) {
    const dow = new Date(dayStartMs).getUTCDay();
    if (workDays.includes(dow)) {
      const openMs = dayStartMs + businessStart * 3600 * 1000;
      const closeMs = dayStartMs + businessEnd * 3600 * 1000;
      const overlapStart = Math.max(openMs, fromIstMs);
      const overlapEnd = Math.min(closeMs, nowIstMs);
      if (overlapEnd > overlapStart) {
        totalMs += overlapEnd - overlapStart;
      }
    }
    dayStartMs += dayMs;
  }

  return totalMs / (3600 * 1000);
}

export type AnalyticsPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';

/**
 * Returns UTC Date objects for start (00:00:00.000 IST) and end (23:59:59.999 IST) of the day.
 */
export function getISTDayRange(date: Date = new Date()): { start: Date; end: Date } {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const day = istDate.getUTCDate();

  const startIST = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const endIST = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  return {
    start: new Date(startIST.getTime() - IST_OFFSET_MS),
    end: new Date(endIST.getTime() - IST_OFFSET_MS),
  };
}

/**
 * Returns UTC Date objects for start (Monday 00:00:00.000 IST) and end (Sunday 23:59:59.999 IST) of the week.
 */
export function getISTWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const dayOfWeek = istDate.getUTCDay(); // 0 is Sunday, 1 is Monday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const day = istDate.getUTCDate() + diffToMonday;

  const startIST = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const endIST = new Date(Date.UTC(year, month, day + 6, 23, 59, 59, 999));

  return {
    start: new Date(startIST.getTime() - IST_OFFSET_MS),
    end: new Date(endIST.getTime() - IST_OFFSET_MS),
  };
}

/**
 * Returns UTC Date objects for calendar date strings (YYYY-MM-DD) bounded at 00:00:00 and 23:59:59.999 IST.
 */
export function getISTCustomRange(startDateStr: string, endDateStr: string): { start: Date; end: Date } {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  const startIST = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0));
  const endIST = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999));

  return {
    start: new Date(startIST.getTime() - IST_OFFSET_MS),
    end: new Date(endIST.getTime() - IST_OFFSET_MS),
  };
}

/**
 * Resolves current and comparison prior periods with strict IST boundaries.
 */
export function getISTPeriodRanges(
  period: AnalyticsPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): {
  start: Date;
  end: Date;
  priorStart: Date;
  priorEnd: Date;
} {
  if (period === 'TODAY') {
    const current = getISTDayRange(referenceDate);
    const priorRef = new Date(referenceDate.getTime() - 24 * 3600 * 1000);
    const prior = getISTDayRange(priorRef);
    return { ...current, priorStart: prior.start, priorEnd: prior.end };
  }

  if (period === 'THIS_WEEK') {
    const current = getISTWeekRange(referenceDate);
    const priorRef = new Date(referenceDate.getTime() - 7 * 24 * 3600 * 1000);
    const prior = getISTWeekRange(priorRef);
    return { ...current, priorStart: prior.start, priorEnd: prior.end };
  }

  if (period === 'CUSTOM' && customStart && customEnd) {
    const current = getISTCustomRange(customStart, customEnd);
    const durationMs = current.end.getTime() - current.start.getTime();
    const priorEnd = new Date(current.start.getTime() - 1);
    const priorStart = new Date(priorEnd.getTime() - durationMs);
    return { ...current, priorStart, priorEnd };
  }

  // Default: THIS_MONTH
  const istDate = new Date(referenceDate.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1; // 1-12
  const current = getISTMonthRange(year, month);

  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;
  const prior = getISTMonthRange(priorYear, priorMonth);

  return { ...current, priorStart: prior.start, priorEnd: prior.end };
}

