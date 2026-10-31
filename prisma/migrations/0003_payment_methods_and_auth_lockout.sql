-- ==============================================================================
-- SunPower Ops: Gateway payment methods + staff login lockout (D13)
-- ==============================================================================

-- 1. Razorpay gateway methods (card / netbanking) mapped into PaymentMethod
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'NET_BANKING';

-- 2. Staff login lockout (Spec 2.6 / D13): 10 failed attempts => temporary lock
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count Int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE users
  ADD CONSTRAINT chk_users_failed_login_nonneg CHECK (failed_login_count >= 0);
