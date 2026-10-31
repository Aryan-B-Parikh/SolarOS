# Known Issues, Technical Debt & Risks — SolarOS

This document catalogs all verified issues, operational risks, and technical debt discovered in the SolarOS codebase. These are documented for awareness; do not attempt automatic fixes without explicit instruction.

---

### Issue 1: Database Connection Port Mismatch Risk
- **Severity**: High (Operational)
- **Evidence**: `.env` and `.env.local` previously contained `localhost:5433` (Docker Compose Postgres port) while the native local PostgreSQL 18 instance with seeded data runs on `localhost:5432`.
- **Affected area**: Database connectivity, Next.js server actions, API routes.
- **Current behavior**: Configured to `postgresql://postgres:admin@localhost:5432/solaros?schema=public` on development hosts.
- **Expected behavior**: Consistent port configuration between local pgAdmin/native service and containerized deployments.
- **Possible impact**: If `DATABASE_URL` reverts to 5433 when running without Docker Compose, Prisma queries throw `PrismaClientInitializationError: Can't reach database server at localhost:5433`.
- **Status**: Mitigated via explicit `.env` and `.env.local` updates.
- **Recommended next investigation/fix**: Standardize on port 5432 across both native and containerized `.env` profiles, or use Docker Compose port mapping `5432:5432`.

---

### Issue 2: Third-Party External Gateway Live Production Keys Unpopulated
- **Severity**: Medium (Deployment Readiness)
- **Evidence**: `.env` contains empty or mock placeholders for `RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET`, `MSG91_AUTH_KEY`, `TWILIO_ACCOUNT_SID`, and `GEMINI_API_KEY`.
- **Affected area**: `src/services/payments.ts`, `src/services/outbox-worker.ts`, `src/lib/ai.ts`.
- **Current behavior**: System operates deterministically using built-in sandbox fallbacks (simulated payment captures, outbox logging, deterministic roof summary calculation).
- **Expected behavior**: Live gateway dispatch once actual production credentials are provided.
- **Possible impact**: Notifications are not delivered to real phones; AI roof photo analysis runs deterministic estimation rather than multimodal LLM vision.
- **Status**: Functional sandbox fallback implemented and tested.
- **Recommended next investigation/fix**: Insert real production merchant credentials before public launch.

---

### Issue 3: Next.js Standalone Build vs Development Server Incompatibility on Windows
- **Severity**: Medium (Development Environment)
- **Evidence**: Enabling `output: 'standalone'` unconditionally in `next.config.js` causes Next.js 14 App Router on Windows to return 404 for valid routes during `next dev`.
- **Affected area**: `next.config.js`, dev server routing.
- **Current behavior**: Restricted to production builds via `output: process.env.NODE_ENV === 'production' && process.env.STANDALONE === 'true' ? 'standalone' : undefined`.
- **Expected behavior**: Dev server routes function seamlessly in development, while standalone output bundles properly during `next build`.
- **Possible impact**: Developer confusion if `output: 'standalone'` is re-enabled unconditionally.
- **Status**: Resolved via conditional configuration.
- **Recommended next investigation/fix**: Keep the conditional guard intact in `next.config.js`.

---

### Issue 4: Concurrent Playwright Worker Socket Saturation in Next.js Dev Mode
- **Severity**: Low (Testing)
- **Evidence**: Running 6+ concurrent Chromium browser workers against `next dev` on Windows NTFS causes socket saturation and `net::ERR_ABORTED` on on-demand page compilation.
- **Affected area**: `playwright.config.ts`, `tests/e2e/`.
- **Current behavior**: Configured with `workers: 1` in `playwright.config.ts`, running tests sequentially.
- **Expected behavior**: Parallel execution on pre-compiled production builds (`next start` or container).
- **Possible impact**: E2E tests take ~17 seconds sequentially rather than ~4 seconds in parallel.
- **Status**: Stabilized with 100% passing tests (9/9).
- **Recommended next investigation/fix**: Point Playwright E2E tests to a pre-compiled `next start` server in CI/CD pipeline to enable full parallel browser execution.

---

### Issue 5: Node.js `--experimental-strip-types` Stdout Warning
- **Severity**: Low (Cosmetic)
- **Evidence**: Executing `npm test` outputs: `(node:...) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time`.
- **Affected area**: `package.json` test script.
- **Current behavior**: All 164 unit tests execute in ~1.5 seconds without ts-node/tsx overhead, but print the experimental warning.
- **Expected behavior**: Silent execution.
- **Possible impact**: None on test outcomes.
- **Status**: Accepted trade-off for high test execution speed.
- **Recommended next investigation/fix**: Can pass `--no-warnings` flag in `package.json` test script if clean stdout is desired.

---

### Issue 6: Local S3 / MinIO Storage Dependency for Photos & Signatures
- **Severity**: Low (Infrastructure)
- **Evidence**: `S3_ENDPOINT` points to `http://localhost:9000` with local credentials `minio_admin`.
- **Affected area**: Site survey photo upload, technician installation sign-off photos, certificate PDF uploads.
- **Current behavior**: Requires MinIO container running locally for binary upload storage; falls back to base64 signatures and local paths if unavailable.
- **Expected behavior**: Cloudflare R2 or AWS S3 endpoint in staging/production environments.
- **Possible impact**: Uploading binary assets in development fails if local MinIO is stopped.
- **Status**: Documented in `deployment/environments.md`.
- **Recommended next investigation/fix**: Verify Cloudflare R2 bucket credentials before cloud deployment.

