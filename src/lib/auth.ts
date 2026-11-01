// Auth: credential login with scrypt hashes, database sessions in httpOnly cookies,
// and the RBAC permission matrix from TRD 2.6 (enforced in the service layer, D13).

import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'

export const SESSION_COOKIE = 'sp_session'
// TRD 2.6: staff sessions expire after 12 idle hours; field devices (technicians)
// keep 30 days. Idle time is tracked per session via lastSeenAt.
const STAFF_IDLE_MS = 12 * 3600 * 1000
const FIELD_IDLE_MS = 30 * 24 * 3600 * 1000
const MAX_FAILED_LOGINS = 10
const LOCK_MINUTES = 15

// ── signed session cookie ────────────────────────────────────────
// The cookie value is `${sessionId}.${hmac}` where hmac = HMAC-SHA256 of the
// session id keyed with AUTH_SECRET. A forged/garbled cookie fails the
// timing-safe check BEFORE any DB lookup, so tampering can never be probed
// against the sessions table. Unsigned cookies (issued before this change)
// are treated as logged out — demo users simply sign in again.
const SESSION_SIGNING_KEY = process.env.AUTH_SECRET ?? 'sunpower-demo-signing-secret'

function signSessionToken(token: string): string {
  return createHmac('sha256', SESSION_SIGNING_KEY).update(token).digest('base64url')
}

/** Verify a raw cookie value `${token}.${hmac}` and return the bare token (null = forged/legacy). */
function verifySessionCookieValue(raw: string | undefined | null): string | null {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const token = raw.slice(0, dot)
  const given = Buffer.from(raw.slice(dot + 1))
  const expected = Buffer.from(signSessionToken(token))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return token
}

// ── login lockout (per email, 15-minute window) ───────────────────
// In-memory counter: 10 failures for the same email inside 15 minutes locks
// that email out for the rest of the window. NOTE: in-memory is fine for the
// single dev server; in production this should live in the DB or Redis so the
// window survives restarts and is shared across instances. The DB-level
// failedLogins/lockedUntil columns remain as defense in depth.
const LOGIN_FAILURE_WINDOW_MS = 15 * 60000
const loginFailures = new Map<string, { count: number; firstAt: number }>()

function loginLockKey(email: string): string {
  return email.trim().toLowerCase()
}

function isLoginLockedOut(key: string): boolean {
  const f = loginFailures.get(key)
  if (!f) return false
  if (Date.now() - f.firstAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.delete(key) // window elapsed — fresh start
    return false
  }
  return f.count >= MAX_FAILED_LOGINS
}

function recordLoginFailure(key: string): void {
  const f = loginFailures.get(key)
  if (!f || Date.now() - f.firstAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAt: Date.now() })
    return
  }
  f.count++
}

function clearLoginFailures(key: string): void {
  loginFailures.delete(key)
}

export type Role = 'DIRECTOR' | 'SALES' | 'TECHNICIAN' | 'WAREHOUSE' | 'SUPPORT' | 'ACCOUNTS'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  technicianId?: string | null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const lockKey = loginLockKey(email)
  // 10 failed attempts for this email inside 15 minutes → locked for the
  // remaining window. Checked BEFORE the DB lookup so it applies equally to
  // addresses that do and do not exist.
  if (isLoginLockedOut(lockKey)) {
    throw new AppError('ACCOUNT_LOCKED', 'Account temporarily locked. Try again in a few minutes.')
  }
  const user = await db.user.findUnique({ where: { email }, include: { technician: true } })
  // Identical response for unknown email, deactivated account and wrong
  // password — a failed login must never reveal whether the address exists.
  if (!user || !user.isActive) {
    recordLoginFailure(lockKey)
    throw new AppError('UNAUTHENTICATED', 'Incorrect email or password.')
  }
  // TRD 2.6: 10 failed logins lock the account for 15 minutes (DB-level,
  // survives restarts; the in-memory counter above covers unknown emails too)
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    recordLoginFailure(lockKey)
    throw new AppError('ACCOUNT_LOCKED', 'Account temporarily locked. Try again in a few minutes.')
  }
  if (!verifyPassword(password, user.passwordHash)) {
    recordLoginFailure(lockKey)
    const failedLogins = user.failedLogins + 1
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins,
        lockedUntil: failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60000) : user.lockedUntil,
      },
    })
    throw new AppError('UNAUTHENTICATED', 'Incorrect email or password.')
  }
  const isField = user.role === 'TECHNICIAN'
  const expiresAt = new Date(Date.now() + (isField ? FIELD_IDLE_MS : 30 * 24 * 3600 * 1000))
  const session = await db.session.create({ data: { userId: user.id, expiresAt, lastSeenAt: new Date() } })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, `${session.id}.${signSessionToken(session.id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
  clearLoginFailures(lockKey)
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } })
  return toSessionUser(user, user.technician?.id ?? null)
}

export async function logout() {
  const jar = await cookies()
  const sid = verifySessionCookieValue(jar.get(SESSION_COOKIE)?.value)
  if (sid) await db.session.deleteMany({ where: { id: sid } })
  jar.delete(SESSION_COOKIE)
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  // HMAC check FIRST: a cookie without a valid signature is either a legacy
  // (pre-signing) cookie or a forged one — both count as logged out, and we
  // clear the stale value so the browser stops sending it.
  const sid = verifySessionCookieValue(raw)
  if (!sid) {
    if (raw) {
      try { jar.delete(SESSION_COOKIE) } catch { /* read-only context — ignore */ }
    }
    return null
  }
  const session = await db.session.findUnique({ where: { id: sid }, include: { user: { include: { technician: true } } } })
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null
  // idle expiry: 12 h for office staff, 30 days for field devices (TRD 2.6)
  const idleLimit = session.user.role === 'TECHNICIAN' ? FIELD_IDLE_MS : STAFF_IDLE_MS
  if (session.lastSeenAt.getTime() + idleLimit < Date.now()) {
    await db.session.deleteMany({ where: { id: sid } })
    return null
  }
  // sliding window: refresh the idle clock at most once a minute per session
  if (Date.now() - session.lastSeenAt.getTime() > 60000) {
    await db.session.update({ where: { id: sid }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return toSessionUser(session.user, session.user.technician?.id ?? null)
}

function toSessionUser(u: { id: string; name: string; email: string; role: string }, technicianId: string | null): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role, technicianId }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.')
  return user
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!roles.includes(user.role)) {
    throw new AppError('FORBIDDEN', `This action is not allowed for the ${user.role} role.`)
  }
  return user
}

// ── Permission matrix (TRD 2.6) ─────────────────────────────────
export type Capability =
  | 'leads.read' | 'leads.write'
  | 'survey.approve'
  | 'discount.overLimit'
  | 'surveyForms.write'      // technician on assigned surveys
  | 'payments.write' | 'payments.read'
  | 'stock.write'            // receipt, adjustment, dispatch
  | 'stock.read'
  | 'purchasing.write' | 'purchasing.read'
  | 'tickets.read' | 'tickets.write'
  | 'warranty.exclusion.approve'
  | 'warranty.exclusion.request'
  | 'users.manage'
  | 'products.write'
  | 'templates.write'
  | 'audit.read'
  | 'accessLinks.manage'
  | 'analytics.full' | 'analytics.stock' | 'analytics.service' | 'analytics.ownPipeline'
  | 'settings.write'
  | 'installations.write'   // crew lead on own jobs
  | 'search.use'

const MATRIX: Record<Capability, Role[]> = {
  'leads.read': ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  'leads.write': ['DIRECTOR', 'SALES'],
  'survey.approve': ['DIRECTOR'],
  'discount.overLimit': ['DIRECTOR'],
  'surveyForms.write': ['DIRECTOR', 'TECHNICIAN'],
  'payments.write': ['DIRECTOR', 'ACCOUNTS'],
  'payments.read': ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  'stock.write': ['DIRECTOR', 'WAREHOUSE'],
  'stock.read': ['DIRECTOR', 'SALES', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'],
  'purchasing.write': ['DIRECTOR', 'WAREHOUSE'],
  'purchasing.read': ['DIRECTOR', 'WAREHOUSE', 'ACCOUNTS'],
  'tickets.read': ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'],
  'tickets.write': ['DIRECTOR', 'SUPPORT'],
  'warranty.exclusion.approve': ['DIRECTOR'],
  'warranty.exclusion.request': ['DIRECTOR', 'SUPPORT'],
  'users.manage': ['DIRECTOR'],
  'products.write': ['DIRECTOR'],
  'templates.write': ['DIRECTOR'],
  'audit.read': ['DIRECTOR', 'ACCOUNTS'],
  'accessLinks.manage': ['DIRECTOR', 'SALES', 'SUPPORT'],
  'analytics.full': ['DIRECTOR', 'ACCOUNTS'],
  'analytics.stock': ['WAREHOUSE'],
  'analytics.service': ['SUPPORT'],
  'analytics.ownPipeline': ['SALES'],
  'settings.write': ['DIRECTOR'],
  'installations.write': ['DIRECTOR', 'TECHNICIAN'],
  'search.use': ['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'],
}

export function can(user: { role: string } | null | undefined, cap: Capability): boolean {
  if (!user) return false
  return MATRIX[cap]?.includes(user.role as Role) ?? false
}

export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser()
  if (!can(user, cap)) throw new AppError('FORBIDDEN', `Your role (${user.role}) cannot perform this action.`)
  return user
}

// simple in-memory rate limiter for public endpoints (5/min per IP)
const buckets = new Map<string, { count: number; resetAt: number }>()
export function rateLimit(key: string, limit = 5, windowMs = 60000): boolean {
  const nowTs = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < nowTs) {
    buckets.set(key, { count: 1, resetAt: nowTs + windowMs })
    return true
  }
  if (b.count >= limit) return false
  b.count++
  return true
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** 128-bit url-safe random token (share links, etc.) */
export function randomToken(): string {
  return randomBytes(16).toString('base64url')
}
