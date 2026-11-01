// Frontend foundation: typed API client, formatters (INR lakh grouping, IST
// dates), stage metadata with the spec's status vocabulary, and data hooks.

'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

// ── API client ───────────────────────────────────────────────────

export interface ApiError extends Error {
  code?: string
  status?: number
  details?: unknown
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: 'no-store',
    })
  } catch {
    // fetch only rejects on network-level failures (offline, aborted)
    throw new Error('Network unreachable — check your connection and try again')
  }
  const text = await res.text()
  // The route handlers always answer JSON, but a mismatched URL, dev-server
  // error page or proxy responds with HTML — parsing that must not leak
  // "Unexpected token '<'" into the UI, so fall back to a clean message.
  let data: any = null
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = null
  }
  if (!res.ok) {
    const err: ApiError = new Error(
      data?.error?.message
        ?? (res.status === 401 ? 'Please sign in again'
          : res.status === 404 ? 'Not found'
            : res.status >= 500 ? 'Server error — please try again'
              : `Request failed (${res.status})`),
    )
    err.code = data?.error?.code ?? 'HTTP_ERROR'
    err.status = res.status
    err.details = data?.error?.details
    throw err
  }
  if (data === null) throw new Error('Unexpected server response')
  return data as T
}

export function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as Error).message)
  return 'Something went wrong'
}

// ── Money / dates (mirror lib/money, lib/dates for the client) ─────

export function money(paise: number | null | undefined, decimals?: number): string {
  if (paise === null || paise === undefined) return '—'
  const neg = paise < 0
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const p = abs % 100
  const showDec = decimals !== undefined ? decimals : p !== 0 ? 2 : 0
  const grouped = groupIndian(String(rupees))
  const dec = showDec > 0 ? '.' + String(p).padStart(2, '0').slice(0, showDec) : ''
  return `${neg ? '−' : ''}Rs ${grouped}${dec}`
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const parts: string[] = []
  let i = rest.length
  while (i > 0) {
    parts.unshift(rest.slice(Math.max(0, i - 2), i))
    i -= 2
  }
  return parts.join(',') + ',' + last3
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function fmtDateTime(dt: string | Date | null | undefined): string {
  if (!dt) return '—'
  const d = typeof dt === 'string' ? new Date(dt) : dt
  const ist = new Date(d.getTime() + 330 * 60000)
  let h = ist.getUTCHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${h}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${ampm}`
}

export function todayStr(): string {
  // IST calendar date (UTC+5:30) so date pickers match the business day (D9)
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
}

/** safe YYYY-MM-DD from a JSON date string, Date, or null */
export function toDateStr(dt: string | Date | null | undefined): string {
  if (!dt) return ''
  if (typeof dt === 'string') return dt.slice(0, 10)
  return new Date(dt.getTime() + 330 * 60000).toISOString().slice(0, 10)
}

export function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr + 'T00:00:00Z').getTime() - Date.now()) / 86400000)
}

export function relTime(dt: string | Date): string {
  const d = typeof dt === 'string' ? new Date(dt) : dt
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} d ago`
  return fmtDate(new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10))
}

// ── Stage metadata (App Flow 4.1/4.2 vocabulary) ──────────────────

export type Tone = 'new' | 'progress' | 'done' | 'warn' | 'danger' | 'neutral' | 'info'

export const LEAD_STAGES: { key: string; label: string }[] = [
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'SURVEY_SCHEDULED', label: 'Survey booked' },
  { key: 'SURVEY_APPROVED', label: 'Survey approved' },
  { key: 'QUOTED', label: 'Quoted' },
  { key: 'WON', label: 'Won' },
  { key: 'LOST', label: 'Lost' },
]

export const ORDER_STAGES: { key: string; label: string }[] = [
  { key: 'PENDING_ADVANCE', label: 'Pending advance' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'READY_TO_DISPATCH', label: 'Ready to dispatch' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'INSTALLED', label: 'Installed' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

export const CUSTOMER_STAGES = [
  { label: 'Enquiry', hint: 'Request received' },
  { label: 'Assessment', hint: 'Site survey' },
  { label: 'Quotation', hint: 'View and decide' },
  { label: 'Order', hint: 'Payment and confirmation' },
  { label: 'Preparation', hint: 'Equipment ready' },
  { label: 'Installation', hint: 'Install day' },
  { label: 'Completion', hint: 'Photos and certificate' },
  { label: 'After-sales', hint: 'Warranty and service' },
]

export function statusLabel(s: string): string {
  return (LEAD_STAGES.find((x) => x.key === s)?.label
    ?? ORDER_STAGES.find((x) => x.key === s)?.label
    ?? s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()))
}

export function statusTone(s: string): Tone {
  if (['NEW', 'OPEN', 'PENDING_ADVANCE', 'DRAFT'].includes(s)) return 'new'
  if (['CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'CONFIRMED', 'ASSIGNED', 'PICKING', 'READY', 'SCHEDULED', 'PREPARING', 'SUBMITTED'].includes(s)) return 'progress'
  if (['WON', 'SURVEY_APPROVED', 'ACCEPTED', 'COMPLETED', 'CLOSED', 'APPROVED', 'INSTALLED', 'DELIVERED', 'RECEIVED', 'DISBURSED', 'PAID', 'IN_STOCK'].includes(s)) return 'done'
  if (['QUOTED', 'SENT', 'IN_PROGRESS', 'IN_TRANSIT', 'AWAITING_SIGNOFF', 'PARTIAL'].includes(s)) return 'info'
  if (['LOST', 'DISQUALIFIED', 'REJECTED', 'CANCELLED', 'SCRAPPED', 'VOID'].includes(s)) return 'neutral'
  if (['ON_HOLD', 'RMA', 'DEAD', 'FAILED', 'OVERDUE'].includes(s)) return 'warn'
  if (['OUT_OF_WARRANTY', 'EXCLUDED', 'UNKNOWN_UNIT', 'CHARGEABLE'].includes(s)) return 'warn'
  return 'neutral'
}

export const VERDICT_COPY: Record<string, { label: string; tone: Tone; note: string }> = {
  IN_WARRANTY: { label: 'In warranty', tone: 'done', note: 'No charge for parts or labour' },
  OUT_OF_WARRANTY: { label: 'Out of warranty', tone: 'warn', note: 'Parts and labour will be billed' },
  EXCLUDED: { label: 'Warranty voided', tone: 'danger', note: 'Excluded with approval (damage or tampering)' },
  UNKNOWN_UNIT: { label: 'Unit not found', tone: 'neutral', note: 'Verify paper records and link the unit' },
}

// ── Data hooks ────────────────────────────────────────────────────

export interface UseDataOptions {
  /** background refresh interval in ms — only ticks while the tab is visible */
  pollMs?: number
  /** refresh when the customer returns to the tab / window (throttled) */
  refetchOnFocus?: boolean
}

/**
 * Fetch with optional live updates for customer-facing pages: a silent
 * background poll (no loading flash, keeps the last good data on failure)
 * plus an immediate refresh when the tab becomes visible again, so changes
 * made by staff and technicians appear without a manual reload.
 */
export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], opts?: UseDataOptions) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const refreshingRef = useRef(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetcherRef.current())
      setRefreshedAt(Date.now())
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  /** silent refresh: keeps the last data and never flashes the loading state.
   *  The payload is diffed against the previous one — an unchanged bundle
   *  skips the state swap entirely, so identical polls never re-render. */
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      const next = await fetcherRef.current()
      setData((prev) => {
        if (prev !== null && JSON.stringify(prev) === JSON.stringify(next)) return prev
        return next
      })
      setRefreshedAt(Date.now())
      setError(null)
    } catch (e) {
      // network blip / momentary server error — keep showing the last good
      // data and retry silently on the next poll cycle
      console.warn('[useData] background refresh failed; keeping last good data', e)
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, deps)

  const pollMs = opts?.pollMs
  const refetchOnFocus = opts?.refetchOnFocus
  useEffect(() => {
    if (!pollMs && !refetchOnFocus) return
    // returning to the tab is debounced so browsers firing BOTH focus and
    // visibilitychange (and rapid alt-tabbing) collapse into one refresh
    const WAKE_DEBOUNCE_MS = 2000
    let wakeTimer: ReturnType<typeof setTimeout> | undefined
    let last = Date.now()
    // poll only while the customer is actually looking at the page: the tab
    // must be visible AND focused (a visible-but-backgrounded window keeps
    // its last good data instead of burning requests)
    const awake = () =>
      (typeof document === 'undefined' ? true : document.visibilityState === 'visible') &&
      (typeof document.hasFocus === 'function' ? document.hasFocus() : true)
    const tick = () => {
      if (!awake() || Date.now() - last < (pollMs ?? Infinity)) return
      last = Date.now()
      void refresh()
    }
    const onWake = () => {
      if (!awake()) return
      if (wakeTimer) clearTimeout(wakeTimer)
      wakeTimer = setTimeout(() => {
        wakeTimer = undefined
        if (awake() && Date.now() - last >= WAKE_DEBOUNCE_MS) {
          last = Date.now()
          void refresh()
        }
      }, WAKE_DEBOUNCE_MS)
    }
    const timer = pollMs ? setInterval(tick, pollMs) : undefined
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      if (timer) clearInterval(timer)
      if (wakeTimer) clearTimeout(wakeTimer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [...deps, pollMs, refetchOnFocus])

  return { data, loading, error, reload, refresh, refreshing, refreshedAt, setData }
}

export function useMutation() {
  const [busy, setBusy] = useState(false)
  const mutate = useCallback(async (fn: () => Promise<unknown>, opts?: { success?: string; onDone?: (data: any) => void; silent?: boolean }) => {
    setBusy(true)
    try {
      const data = await fn()
      if (opts?.success && !opts.silent) toast.success(opts.success)
      opts?.onDone?.(data)
      return data
    } catch (e) {
      // Expected business-rule rejections (guards, checklists, transitions) are
      // surfaced as a toast. Never rethrow: callers fire-and-forget, so a rethrow
      // only becomes an unhandled rejection / dev-overlay "runtime error".
      if (!opts?.silent) toast.error(errMessage(e))
      console.warn('[mutate] failed:', e instanceof Error ? e.message : e)
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, mutate }
}

// ── Hash router ───────────────────────────────────────────────────

const EMPTY_PARTS: string[] = []

// Stable snapshot cache: useSyncExternalStore compares snapshots with
// Object.is, so parsing a fresh array on every call would loop forever.
let lastRawHash: string | null = null
let lastPartsCache: string[] = []

function getHashParts(): string[] {
  const raw = window.location.hash
  if (raw !== lastRawHash) {
    lastRawHash = raw
    lastPartsCache = raw.replace(/^#\/?/, '').split('/').filter(Boolean)
  }
  return lastPartsCache
}

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useHashRoute(): [string[], () => void] {
  // SSR-safe hash routing via useSyncExternalStore: during SSR and the
  // hydration pass React uses the server snapshot (empty route) so the first
  // client render matches the server HTML — reading window.location.hash in a
  // useState initializer instead caused a hydration mismatch on deep links
  // like /#/p/<token> (server rendered the loading shell, client the view).
  // After hydration React synchronously re-renders with the real hash, and
  // client-mounted views (detail pages) see it on their very first render.
  const parts = useSyncExternalStore(subscribeHash, getHashParts, () => EMPTY_PARTS)
  const [, force] = useState(0)
  const refresh = useCallback(() => force((n) => n + 1), [])
  return [parts, refresh]
}

export function nav(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`
}

// ── misc helpers ──────────────────────────────────────────────────

export function maskPhone(phone: string): string {
  return phone.slice(0, 6) + ' ··· ' + phone.slice(-3)
}

export function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return phone
}

export function pct(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '—'
  return `${(bp / 100).toFixed(1)}%`
}

export function qty(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(Number(n) < 10 ? 2 : 0)
}

export function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
}
