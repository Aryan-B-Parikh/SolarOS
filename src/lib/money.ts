// Money helpers: integer paise everywhere, INR lakh grouping for display (D9).

/** rupees -> paise (integer) */
export function rupeesToPaise(r: number): number {
  return Math.round(r * 100)
}

/** paise -> rupees (number) */
export function paiseToRupees(p: number): number {
  return p / 100
}

/** Format paise as Rs with Indian lakh grouping, e.g. 3449250 -> "Rs 34,492.50" ; 15000000 -> "Rs 1,50,000" */
export function formatPaise(p: number | null | undefined, opts?: { decimals?: number }): string {
  if (p === null || p === undefined) return '—'
  const neg = p < 0
  const abs = Math.abs(p)
  const rupees = Math.floor(abs / 100)
  const paisePart = abs % 100
  const showDecimals = opts?.decimals !== undefined ? opts.decimals : (paisePart !== 0 ? 2 : 0)
  const grouped = groupIndian(rupees.toString())
  const dec = showDecimals > 0 ? '.' + paisePart.toString().padStart(2, '0').slice(0, showDecimals) : ''
  return `${neg ? '-' : ''}Rs ${grouped}${dec}`
}

/** Indian digit grouping: 1234567 -> "12,34,567" */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  return groupIndianSimple(rest) + ',' + last3
}

function groupIndianSimple(s: string): string {
  // group the remaining digits in pairs from the right: 1234 -> "12,34"
  const parts: string[] = []
  let i = s.length
  while (i > 0) {
    parts.unshift(s.slice(Math.max(0, i - 2), i))
    i -= 2
  }
  return parts.join(',')
}

/** Parse a user-entered rupee string ("1,50,000.50") to paise */
export function parseRupeeString(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined || s === '') return null
  const cleaned = s.toString().replace(/[Rs,\s]/g, '')
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

/** percentage of paise, rounded */
export function pctOfPaise(paise: number, pct: number): number {
  return Math.round((paise * pct) / 100)
}

/** basis points (1800 = 18%) of paise, rounded */
export function bpOfPaise(paise: number, bp: number): number {
  return Math.round((paise * bp) / 10000)
}
