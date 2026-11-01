// Typed application errors with the spec's error format (TRD 2.7).

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'INSUFFICIENT_STOCK'
  | 'UNIT_NOT_AVAILABLE'
  | 'ALREADY_SCANNED'
  | 'WRONG_PRODUCT'
  | 'LINK_EXPIRED'
  | 'LINK_LOCKED'
  | 'SURVEY_NOT_APPROVED'
  | 'DISCOUNT_NEEDS_APPROVAL'
  | 'PHOTOS_REQUIRED'
  | 'CHECKLIST_INCOMPLETE'
  | 'DISPATCH_INCOMPLETE'
  | 'RATE_LIMITED'
  | 'VERIFICATION_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'CONFLICT'
  | 'MAILER_DISABLED'
  | 'AI_UNAVAILABLE'
  | 'INTERNAL'

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  UNIT_NOT_AVAILABLE: 409,
  ALREADY_SCANNED: 409,
  WRONG_PRODUCT: 409,
  CONFLICT: 409,
  LINK_EXPIRED: 410,
  LINK_LOCKED: 429,
  RATE_LIMITED: 429,
  VERIFICATION_REQUIRED: 403,
  ACCOUNT_LOCKED: 423,
  SURVEY_NOT_APPROVED: 422,
  DISCOUNT_NEEDS_APPROVAL: 422,
  PHOTOS_REQUIRED: 422,
  CHECKLIST_INCOMPLETE: 422,
  DISPATCH_INCOMPLETE: 422,
  MAILER_DISABLED: 503,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
}

export class AppError extends Error {
  code: ErrorCode
  status: number
  details?: unknown
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.status = STATUS[code] ?? 500
    this.details = details
  }
}

export function errorBody(err: unknown, requestId: string) {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message, details: err.details ?? null, requestId } }
  }
  console.error('[internal]', err)
  return { error: { code: 'INTERNAL' as ErrorCode, message: 'Something went wrong on our side.', details: null, requestId } }
}
