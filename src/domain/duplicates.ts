/**
 * SunPower Ops Duplicate Matching Engine (FR-1.4 / Section 2.4)
 * Rules:
 * - Phone is normalised to E.164 and matched exactly (auto-links to customer)
 * - Address is normalised and compared with trigram similarity + pincode
 * - A score above threshold (default 0.6) raises an open duplicate flag; NEVER auto-merges
 */

export function normalizePhone(phone: string): string {
  // Strip non-digits except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  // If Indian 10 digits without +91, prepend +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\b(road|rd|street|st|marg|cross|nagar|soc|society|apt|apartment|flat|block|plot)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates trigram similarity between two strings (0.0 to 1.0)
 */
export function calculateTrigramSimilarity(str1: string, str2: string): number {
  const s1 = `  ${normalizeAddress(str1)} `;
  const s2 = `  ${normalizeAddress(str2)} `;

  if (s1.trim() === '' || s2.trim() === '') return 0;
  if (s1 === s2) return 1.0;

  const getTrigrams = (str: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < str.length - 2; i++) {
      const tri = str.substring(i, i + 3);
      map.set(tri, (map.get(tri) || 0) + 1);
    }
    return map;
  };

  const map1 = getTrigrams(s1);
  const map2 = getTrigrams(s2);

  let matches = 0;
  map1.forEach((count1, tri) => {
    const count2 = map2.get(tri);
    if (count2) {
      matches += Math.min(count1, count2);
    }
  });

  const totalTrigrams = (s1.length - 2) + (s2.length - 2);
  if (totalTrigrams === 0) return 0;
  return Number(((2 * matches) / totalTrigrams).toFixed(3));
}

export function isAddressDuplicate(
  address1: string,
  pincode1: string,
  address2: string,
  pincode2: string,
  threshold = 0.55
): { isDuplicate: boolean; score: number } {
  // If pincodes don't match, not an address duplicate
  if (pincode1.trim() !== pincode2.trim()) {
    return { isDuplicate: false, score: 0 };
  }

  const score = calculateTrigramSimilarity(address1, address2);
  return {
    isDuplicate: score >= threshold,
    score,
  };
}

