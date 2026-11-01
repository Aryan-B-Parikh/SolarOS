// Shared QR label helper (FR-5.2, FR-5.9): every serialized unit's QR encodes
// an ABSOLUTE URL to the public warranty page so a scanned label opens the
// page on any phone. Used by receipt creation and the label-data endpoint alike.
// Scanners "type" whatever the label contains, so every server-side lookup
// normalizes scanned text through parseScannedCode() first.

import QRCode from 'qrcode'

export const DEFAULT_ORIGIN = 'http://localhost:3000'

/** Deployed origin from the environment (APP_BASE_URL, trailing slash stripped).
 *  Takes priority over request headers so generated links/QR labels are
 *  deterministic no matter which host/proxy served the request. */
export function appBaseUrl(): string | null {
  const base = process.env.APP_BASE_URL?.trim()
  if (!base) return null
  return /^https?:\/\//i.test(base) ? base.replace(/\/+$/, '') : null
}

/**
 * Absolute URL of the public warranty page for a unit's QR code / serial.
 * The app is hash-routed (the page renders from #/w/:code), so the QR carries
 * the hash form — opening it on any phone lands on the warranty page.
 */
export function warrantyUrl(origin: string | undefined | null, code: string): string {
  const base = origin && /^https?:\/\//i.test(origin) ? origin : DEFAULT_ORIGIN
  return `${base.replace(/\/+$/, '')}/#/w/${code}`
}

/**
 * Normalize any scanned text to a unit code (qrCode or serial). A printed QR
 * label carries a full URL like https://host/#/w/SP1A2B3C4D and keyboard-wedge
 * scanners type that whole URL into the input, so lookups must accept:
 *   - the full URL (hash form  …/#/w/CODE  or legacy path form  …/w/CODE)
 *   - a bare path        /w/CODE
 *   - the bare code      SP1A2B3C4D / INV3K-26A-000305
 */
export function parseScannedCode(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  const m = s.match(/\/w\/([^/?#&\s]+)/i)
  if (m) return decodeURIComponent(m[1])
  if (/^https?:\/\//i.test(s)) {
    try {
      const seg = new URL(s).pathname.split('/').filter(Boolean).pop()
      if (seg) return decodeURIComponent(seg)
    } catch {
      // not a parseable URL — fall through and use the raw text
    }
  }
  return s
}

/**
 * Best-effort public origin of an incoming request, for printing absolute QR
 * URLs. Priority: APP_BASE_URL when set (deterministic links regardless of the
 * serving host), then the request's Origin header, the forwarded host (proxy)
 * or the request URL itself — so labels never silently encode
 * http://localhost:3000.
 */
export function requestOrigin(req: {
  headers: { get(name: string): string | null }
  nextUrl?: { origin: string }
}): string {
  const fromEnv = appBaseUrl()
  if (fromEnv) return fromEnv
  const origin = req.headers.get('origin')
  if (origin && /^https?:\/\//i.test(origin)) return origin
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) {
    const proto =
      req.headers.get('x-forwarded-proto') ??
      (/^(localhost|127\.|0\.0\.0\.0|\[::)/i.test(host) ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return req.nextUrl?.origin ?? DEFAULT_ORIGIN
}

/** QR rendered as a data URL the label sheet can embed directly. */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 160 })
}
