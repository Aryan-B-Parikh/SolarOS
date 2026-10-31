# SolarOS Deployment - Pre-Release & Verification Checklist

Complete and check off each item before and immediately after deploying a release to staging or production.

---

## 1. Code & Build Verification

- [ ] All unit test suites pass (`npm test` reports 164/164 tests passing with 0 failures).
- [ ] End-to-end browser tests pass on Desktop and Mobile (`npx playwright test` passes 12/12 tests).
- [ ] TypeScript compilation check completes without errors (`npm run typecheck`).
- [ ] ESLint check passes without module-boundary violations (`npm run lint`).
- [ ] Production build succeeds without warnings (`npm run build`).

---

## 2. Environment & Secrets Configuration

- [ ] `DATABASE_URL` is configured with connection pooling (`?schema=public&pgbouncer=true`).
- [ ] `AUTH_SECRET` is set to a secure, random 256-bit hexadecimal string.
- [ ] `APP_BASE_URL` matches the production domain (`https://ops.sunpower.in`).
- [ ] `CRON_SECRET` is updated and shared only with the automated scheduler.
- [ ] Payment gateway keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are active and verified.
- [ ] Outbox communication keys (`MSG91_AUTH_KEY`, `TWILIO_ACCOUNT_SID`, `RESEND_API_KEY`) are active.
- [ ] `GEMINI_API_KEY` is configured for AI site assessment and vision analysis.

---

## 3. Database & Migration Preparedness

- [ ] Full pre-release database snapshot taken (`pg_dump -Fc > pre_release_snapshot.dump`).
- [ ] Migrations reviewed for non-destructive operations.
- [ ] `npx prisma migrate deploy` executed successfully.
- [ ] All 53 tables, views, and partial unique indexes verified active.

---

## 4. Reverse Proxy & Security Hardening

- [ ] Nginx configuration syntax verified (`nginx -t`).
- [ ] Port 80 redirects to Port 443 with HTTP 301.
- [ ] SSL certificate is valid and not nearing expiration (`certbot certificates`).
- [ ] Security headers active (`Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`).
- [ ] Rate limiting zones active for public enquiry submissions (`limit_req zone=enquiry_limit`).

---

## 5. Post-Deployment Smoke Testing

- [ ] Public enquiry submission creates a new Lead and returns a secure portal link.
- [ ] Staff dashboard loads with active KPI metrics.
- [ ] Quotation builder successfully recalculates dynamic BOM quantities and margins.
- [ ] Field technician PWA (`/tech/today` and `/tech/jobs/[id]`) renders on mobile viewports.
- [ ] Public equipment QR warranty lookup (`/w/[code]`) renders active coverage.
- [ ] Outbox cron job (`POST /api/v1/cron/outbox`) processes queued delivery tasks.
- [ ] Predictive maintenance cron job (`POST /api/v1/cron/maintenance`) runs without errors.

