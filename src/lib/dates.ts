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

