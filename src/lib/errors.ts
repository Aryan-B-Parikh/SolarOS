/**
 * Standard Application Error Definitions & Utilities
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VERIFICATION_REQUIRED'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'UNIT_NOT_AVAILABLE'
  | 'ALREADY_SCANNED'
  | 'WRONG_PRODUCT'
  | 'LINE_ALREADY_FULFILLED'
  | 'LINK_NOT_FOUND'
  | 'LINK_EXPIRED'
  | 'LINK_REVOKED'
  | 'LINK_LOCKED'
  | 'RATE_LIMITED'
  | 'SURVEY_NOT_APPROVED'
  | 'DISCOUNT_NEEDS_APPROVAL'
  | 'PHOTOS_REQUIRED'
  | 'CHECKLIST_INCOMPLETE'
  | 'HOLD_REASON_REQUIRED'
  | 'DISPATCH_INCOMPLETE'
  | 'SERIAL_REQUIRED'
  | 'DUPLICATE_SERIAL'
  | 'TICKET_NOT_FOUND'
  | 'TECHNICIAN_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'REMOVED_UNIT_NOT_FOUND'
  | 'REPLACEMENT_UNIT_NOT_FOUND'
  | 'REPLACEMENT_NOT_IN_STOCK'
  | 'PRODUCT_MISMATCH'
  | 'TICKET_ALREADY_CLOSED'
  | 'INVALID_STATE'
  | 'INVALID_REOPEN_STATE'
  | 'TRANSITION_REJECTED'
  | 'UPSTREAM_ERROR'
  | 'ACCOUNT_LOCKED'
  | 'INTERNAL_SERVER_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function formatErrorResponse(err: unknown, requestId: string = 'req-' + Date.now().toString(36)) {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      },
    };
  }

  const errorObj = err as any;
  const statusCode = errorObj?.statusCode || 500;
  const code = errorObj?.code || 'INTERNAL_SERVER_ERROR';
  const message = errorObj?.message || 'An unexpected error occurred';

  return {
    status: statusCode,
    body: {
      error: {
        code,
        message,
        details: errorObj?.details,
        requestId,
      },
    },
  };
}

