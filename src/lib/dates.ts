// Date helpers: UTC storage, IST (Asia/Kolkata) calendar rules (D9).
// Date-only fields are "YYYY-MM-DD" strings interpreted in IST. The core
// conversions delegate to lib/tz.ts (Intl-based, honours APP_TIMEZONE) so the
// day boundary is the app-timezone midnight, not the UTC one.

import { istDateString, startOfIstDay } from '@/lib/tz'

const IST_OFFSET_MIN = 330 // UTC+5:30

/** current time as Date (UTC instant) */
export function now(): Date {
  return new Date()
}

/** Today's date in IST as YYYY-MM-DD */
export function istToday(): string {
  return istDateString(new Date())
}

/** Convert an instant to an IST calendar date string YYYY-MM-DD */
export function toIstDateString(d: Date): string {
  return istDateString(d)
}

/** Parse YYYY-MM-DD into a UTC instant representing 00:00 IST of that date */
export function fromIstDateString(s: string): Date {
  return startOfIstDay(s)
}

/** add days to a YYYY-MM-DD string */
export function addDays(s: string, days: number): string {
  const d = fromIstDateString(s)
  d.setUTCDate(d.getUTCDate() + days)
  return toIstDateString(d)
}

/** Difference in days between two YYYY-MM-DD strings (b - a) */
export function daysBetween(a: string, b: string): number {
  const da = fromIstDateString(a).getTime()
  const dbb = fromIstDateString(b).getTime()
  return Math.round((dbb - da) / 86400000)
}

/**
 * Add months to a YYYY-MM-DD with calendar semantics (clamped to month end).
 * Warranty end = start + months - 1 day (e.g. 2026-11-05 + 24m - 1d = 2028-11-04).
 */
export function addMonthsClamped(s: string, months: number, minusOneDay = false): string {
  const [y, m, d] = s.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  const nd = Math.min(d, lastDay)
  const out = `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
  return minusOneDay ? addDays(out, -1) : out
}

/** Warranty end date: start + months - 1 day */
export function warrantyEnd(startDate: string, months: number): string {
  return addMonthsClamped(startDate, months, true)
}

/** "31 Oct 2026" display format */
export function formatDate(s: string | Date | null | undefined): string {
  if (!s) return '—'
  const d = typeof s === 'string' ? fromIstDateString(s) : s
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60000)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]} ${t.getUTCFullYear()}`
}

/** "31 Oct 2026, 4:15 PM" display format for instants */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  const t = new Date(dt.getTime() + IST_OFFSET_MIN * 60000)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  let h = t.getUTCHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${h}:${String(t.getUTCMinutes()).padStart(2, '0')} ${ampm}`
}

/** month key YYYY-MM from an IST date string */
export function monthKey(s: string): string {
  return s.slice(0, 7)
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${y}`
}

/** first and last date of the month containing an IST date string */
export function monthBounds(s: string): { from: string; to: string } {
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7))
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${s.slice(0, 7)}-01`, to: `${s.slice(0, 7)}-${String(last).padStart(2, '0')}` }
}

/** period bounds for dashboard: today | week (last 7d) | month | custom */
export function periodBounds(kind: 'today' | 'week' | 'month', ref = istToday()): { from: string; to: string } {
  const today = ref
  if (kind === 'today') return { from: today, to: today }
  if (kind === 'week') return { from: addDays(today, -6), to: today }
  return monthBounds(today)
}

/** Business calendar settings slice (FR-1.6) */
export interface BusinessCalendar {
  businessDays: number[]      // ISO weekday 0=Sun…6=Sat
  businessStartHour: number   // IST hour the team starts, e.g. 9
  businessEndHour: number     // IST hour the team stops, e.g. 19
}

/**
 * FR-1.6: add N business hours to an instant, walking the IST business
 * calendar (working days + opening hours). A lead created 30 minutes before
 * closing on Friday gets its 4 business hours on Saturday morning, not
 * Friday night.
 */
export function addBusinessHours(from: Date, hours: number, cal: BusinessCalendar): Date {
  let t = new Date(from.getTime())
  let remainingMin = Math.round(hours * 60)
  let guard = 0
  while (remainingMin > 0 && guard < 500) {
    guard++
    const ist = new Date(t.getTime() + IST_OFFSET_MIN * 60000)
    const dow = ist.getUTCDay()
    const minutesIntoDay = ist.getUTCHours() * 60 + ist.getUTCMinutes()
    const openMin = cal.businessStartHour * 60
    const closeMin = cal.businessEndHour * 60
    if (!cal.businessDays.includes(dow) || minutesIntoDay < openMin) {
      // jump to the next opening moment (same delta lands on open time)
      t = new Date(t.getTime() + (1440 - minutesIntoDay + openMin) * 60000)
      continue
    }
    if (minutesIntoDay >= closeMin) {
      t = new Date(t.getTime() + (1440 - minutesIntoDay + openMin) * 60000)
      continue
    }
    const leftToday = closeMin - minutesIntoDay
    const use = Math.min(leftToday, remainingMin)
    remainingMin -= use
    if (remainingMin > 0) t = new Date(t.getTime() + use * 60000)
  }
  return t
}
