/**
 * Builds a Google Maps navigation URL for a site address (FR-6.1).
 */
export function buildMapUrl(...parts: Array<string | null | undefined>): string {
  const address = parts.filter((p) => p && p.trim().length > 0).join(', ');
  if (!address) return 'https://maps.google.com';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
