// App-timezone helpers (D9): the business "day" is the calendar day in
// APP_TIMEZONE (default Asia/Kolkata), NOT the UTC day. All server-side
// day-boundary math (dashboard "today" counters, digest windows, warranty
// coverage) goes through these helpers so 00:00–05:30 IST activity lands on
// the correct IST date instead of the previous UTC one.
//
// Implemented with the well-known Intl.DateTimeFormat pattern (no deps):
// en-CA formatting yields "YYYY-MM-DD" for the zone, then Date.UTC() of that
// Y-M-D minus the zone's offset gives the UTC instant of local midnight.

/** Configured business timezone (APP_TIMEZONE, default Asia/Kolkata). */
export function appTz(): string {
  const tz = process.env.APP_TIMEZONE?.trim()
  return tz || 'Asia/Kolkata'
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Wall-clock components of an instant in the app timezone. */
function wallClockInTz(d: Date, tz: string): WallClock {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, number> = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // hour "24" appears for midnight with hour12:false in some ICU builds
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

/** Offset of the app timezone at the given instant, in ms east of UTC. */
function tzOffsetMs(d: Date): number {
  const w = wallClockInTz(d, appTz())
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - d.getTime()
}

/** "YYYY-MM-DD" of an instant in the app timezone. */
export function istDateString(d: Date = new Date()): string {
  // en-CA with date-only parts formats directly as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: appTz(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Current instant (UTC Date) — named for pairing with startOfTodayIst(). */
export function nowIst(): Date {
  return new Date()
}

/** UTC instant of the app-timezone midnight that started today. */
export function startOfTodayIst(): Date {
  return startOfIstDay(istDateString(new Date()))
}

/** UTC instant of app-timezone midnight for a "YYYY-MM-DD" date string. */
export function startOfIstDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`startOfIstDay: expected YYYY-MM-DD, got "${ymd}"`)
  const naive = Date.UTC(y, m - 1, d)
  // Shift by the zone's offset (constant +5:30 for Asia/Kolkata; for DST zones
  // this uses the offset around local noon, landing within the DST hour).
  const offset = tzOffsetMs(new Date(naive + 6 * 3600 * 1000))
  return new Date(naive - offset)
}

/** UTC instant one ms before the next app-timezone midnight after "YYYY-MM-DD". */
export function endOfIstDay(ymd: string): Date {
  return new Date(startOfIstDay(ymd).getTime() + 24 * 3600 * 1000 - 1)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** UI label for an instant in the app timezone: "31 Oct 2026". */
export function fmtIstDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return String(d)
  const w = wallClockInTz(dt, appTz())
  return `${w.day} ${MONTHS[w.month - 1]} ${w.year}`
}
