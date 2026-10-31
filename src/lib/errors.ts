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
  | 'INSUFFICIENT_STOCK'
  | 'UNIT_NOT_AVAILABLE'
  | 'ALREADY_SCANNED'
  | 'WRONG_PRODUCT'
  | 'LINK_EXPIRED'
  | 'LINK_REVOKED'
  | 'LINK_LOCKED'
  | 'RATE_LIMITED'
  | 'SURVEY_NOT_APPROVED'
  | 'DISCOUNT_NEEDS_APPROVAL'
  | 'PHOTOS_REQUIRED'
  | 'CHECKLIST_INCOMPLETE'
  | 'DISPATCH_INCOMPLETE'
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

