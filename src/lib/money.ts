/**
 * SunPower Ops Money Helper
 * Currency: INR (Indian Rupees)
 * Storage: Integer Paise (1 Rupee = 100 Paise)
 * Formatting: Indian Numbering System (Lakh / Crore grouping) e.g., Rs 1,50,000
 */

export function rupeesToPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}

export function paiseToRupees(paise: bigint | number): number {
  return Number(paise) / 100;
}

/**
 * Formats paise into Indian Lakh format:
 * Examples:
 *  15000000n paise (1,50,000 Rs) -> "Rs 1,50,000"
 *  3450000n paise (34,500 Rs) -> "Rs 34,500"
 *  1000000000n paise (1,00,00,000 Rs) -> "Rs 1,00,00,000"
 */
export function formatPaise(paise: bigint | number, options?: { prefix?: string; showPaise?: boolean }): string {
  const prefix = options?.prefix ?? 'Rs ';
  const showPaise = options?.showPaise ?? false;

  const totalPaise = typeof paise === 'bigint' ? paise : BigInt(Math.round(paise));
  const isNegative = totalPaise < 0n;
  const absPaise = isNegative ? -totalPaise : totalPaise;

  const rupees = absPaise / 100n;
  const remainderPaise = absPaise % 100n;

  const rupeesStr = rupees.toString();
  let formattedRupees = '';

  if (rupeesStr.length <= 3) {
    formattedRupees = rupeesStr;
  } else {
    const last3 = rupeesStr.substring(rupeesStr.length - 3);
    const otherNumbers = rupeesStr.substring(0, rupeesStr.length - 3);
    // Indian grouping: groups of 2 for remaining digits
    const grouped = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedRupees = `${grouped},${last3}`;
  }

  let result = `${isNegative ? '-' : ''}${prefix}${formattedRupees}`;
  if (showPaise || (remainderPaise > 0n && showPaise !== false)) {
    result += `.${remainderPaise.toString().padStart(2, '0')}`;
  }

  return result;
}

/**
 * Parses user input currency string into paise
 * Handles strings like "1,50,000", "Rs 1,50,000", "₹ 34500.50"
 */
export function parseMoneyToPaise(input: string | number): bigint {
  if (typeof input === 'number') {
    return rupeesToPaise(input);
  }
  const cleaned = input.replace(/[^\d.-]/g, '');
  if (!cleaned || isNaN(Number(cleaned))) {
    return 0n;
  }
  const floatVal = parseFloat(cleaned);
  return BigInt(Math.round(floatVal * 100));
}

