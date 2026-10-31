/**
 * Structured JSON Logger
 * Formats logs with requestId, masks phone numbers, strips tokens/signatures.
 */

export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\s+/g, '');
  if (digits.length <= 4) return '***';
  return digits.slice(0, 3) + '*****' + digits.slice(-2);
}

export function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('token') || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('signature')) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey.includes('phone')) {
      sanitized[key] = maskPhone(sanitized[key]);
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }
  return sanitized;
}

export const logger = {
  info: (message: string, context?: Record<string, any>) => {
    console.log(
      JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        message,
        ...(context ? sanitizeLogData(context) : {}),
      })
    );
  },
  warn: (message: string, context?: Record<string, any>) => {
    console.warn(
      JSON.stringify({
        level: 'warn',
        time: new Date().toISOString(),
        message,
        ...(context ? sanitizeLogData(context) : {}),
      })
    );
  },
  error: (message: string, error?: unknown, context?: Record<string, any>) => {
    console.error(
      JSON.stringify({
        level: 'error',
        time: new Date().toISOString(),
        message,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
        ...(context ? sanitizeLogData(context) : {}),
      })
    );
  },
};

