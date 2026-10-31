import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, formatErrorResponse } from '../../src/lib/errors.ts';
import { maskPhone, sanitizeLogData } from '../../src/lib/logger.ts';

describe('Error Handling & Logging Sanitization', () => {
  it('formats AppError with correct status and error code', () => {
    const err = new AppError('INSUFFICIENT_STOCK', 'Only 2 inverters left in stock', 409, { available: 2 });
    const formatted = formatErrorResponse(err, 'req-123');

    assert.equal(formatted.status, 409);
    assert.equal(formatted.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal(formatted.body.error.message, 'Only 2 inverters left in stock');
    assert.equal(formatted.body.error.requestId, 'req-123');
  });

  it('masks phone numbers in logs to prevent PII exposure', () => {
    assert.equal(maskPhone('+919825000001'), '+91*****01');
    assert.equal(maskPhone('9876543210'), '987*****10');
  });

  it('redacts tokens, secrets, signatures from log contexts', () => {
    const context = {
      user: 'test',
      phone: '+919825000001',
      accessToken: 'secret_12345678',
      signatureData: 'data:image/png;base64,...',
      password: 'password123',
    };

    const sanitized = sanitizeLogData(context);
    assert.equal(sanitized.accessToken, '[REDACTED]');
    assert.equal(sanitized.signatureData, '[REDACTED]');
    assert.equal(sanitized.password, '[REDACTED]');
    assert.equal(sanitized.phone, '+91*****01');
  });
});
