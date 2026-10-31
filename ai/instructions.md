# AI Agent Working Instructions — SolarOS

These instructions govern any AI agent or software engineer operating on the SolarOS codebase. All future changes must strictly adhere to these rules and conventions.

---

## 1. Project-Specific Rules & Invariants

1. **Monolithic Architecture & Separation of Concerns**:
   - The application is a unified Next.js 14 App Router full-stack system with TypeScript in strict mode.
   - Core domain business logic belongs exclusively in `src/domain/` as pure, deterministic functions without I/O or database dependencies.
   - Database queries, state changes, external service dispatches, and transactions belong in `src/services/`.
   - Route handlers in `app/api/v1/` must act solely as thin HTTP adaptors validating payloads against `src/contracts/` schemas and calling `src/services/`.
   - UI components reside in `app/` and `src/components/`, consuming services via typed API routes or server actions.

2. **Database Invariants**:
   - **PostgreSQL Port**: In local development, PostgreSQL is hosted on port `5432` (`postgresql://postgres:admin@localhost:5432/solaros?schema=public`). Never revert this to port `5433` without verifying the active PostgreSQL service.
   - **Prisma Schema Ownership**: `prisma/schema.prisma` and shared Zod schemas in `src/contracts/` must remain synchronized. Any schema modification requires running `npx prisma generate` and updating test fixtures.
   - **Financial Calculations in Paise**: All monetary values are integers in paise (1 INR = 100 paise) using `BigInt` or integer arithmetic. Never use floating-point types for currency calculations.
   - **IST Calendar Day Boundaries**: Solar installation scheduling and financial reporting must calculate day start (00:00:00.000) and day end (23:59:59.999) using Indian Standard Time (`UTC+05:30`) via `src/lib/dates.ts`.

3. **Stock & Inventory Safeguards (ADR D2 & D3)**:
   - Stock quantities in `stock_levels` must never be manually overwritten with arbitrary values. All adjustments, receipts, dispatches, and returns must create immutable rows in `stock_movements`.
   - Stock reservations must sort line items deterministically by `productId` ascending before acquiring row locks to prevent PostgreSQL deadlocks under high concurrency.

4. **Security & Customer Link Boundaries (ADR D11 & D14)**:
   - Token parameters for customer portals, quotes, and certificates are 128-bit random strings; only their SHA-256 hashes are stored in `customer_access_links`. Never log raw tokens or store unhashed links.
   - Public customer endpoints must never return raw database UUIDs or PII from unrelated customers. Phone challenge requires the last four digits of the customer's phone number. Five consecutive failures trigger a 15-minute temporary lockout.

---

## 2. Architecture Constraints

- **Single Atomic Transaction per Workflow Step (ADR D1)**: All state transitions across leads, orders, inventory reservations, dispatches, and installations must execute within a single `prisma.$transaction`.
- **Asynchronous Notifications via Outbox (ADR D6)**: Never call third-party SMS, WhatsApp, or Email gateways directly in web request lifecycles. Insert an event into the `outbox` table and let `src/services/outbox-worker.ts` process it asynchronously.
- **Next.js Standalone Build Constraint**: `output: 'standalone'` in `next.config.js` is restricted to production environments (`process.env.NODE_ENV === 'production' && process.env.STANDALONE === 'true'`). Enabling standalone mode in `next dev` breaks development routing on Windows.

---

## 3. Discovered Coding Conventions

- **Module Boundary & Imports**:
  - Use absolute path alias `@/` pointing to the repository root for all internal imports (e.g., `@/src/lib/db`, `@/src/services/orders`).
- **Error Handling**:
  - Always throw `AppError` instances from `@/src/lib/errors` with specific domain error codes (e.g., `INSUFFICIENT_STOCK`, `CHECKLIST_INCOMPLETE`, `PHOTOS_REQUIRED`, `INVALID_STATE_TRANSITION`).
- **Formatting**:
  - Indian Rupee currency formatting uses Indian lakh/crore groupings (`Rs 1,50,000`) via `formatPaise()` in `@/src/lib/money.ts`.
  - Date formatting displays as `DD MMM YYYY` (e.g., `31 Oct 2026`) in Indian Standard Time via `@/src/lib/dates.ts`.

---

## 4. Files & Modules Requiring Extra Caution

- `prisma/schema.prisma`: Core schema for 53 tables. Any alteration impacts migrations, constraints, and client types.
- `src/domain/bom.ts`: Sizing and Bill-of-Materials rules. Affects financial costing and margin verification across all quotes.
- `src/services/payments.ts`: Payment verification, Razorpay webhook signature parsing, order confirmation, and automated stock reservation.
- `src/services/dispatch.ts`: Serialized asset management and automated warranty record creation.
- `src/lib/access-links.ts`: Cryptographic link generation, hashing, rate limiting, and customer authentication boundaries.

---

## 5. Items Requiring Explicit User Approval Before Modification

- Changing the 30% advance payment confirmation threshold.
- Altering the 5% sales discount authorization ceiling.
- Modifying warranty start basis rules (`DELIVERY` vs `INSTALLATION_SIGNOFF`).
- Modifying database schemas or dropping tables/columns.
- Removing or altering the 164 passing unit tests or 9 Playwright end-to-end tests.

---

## 6. Testing & Validation Expectations

- **Unit Test Runner**: Node test runner (`node --experimental-strip-types --test tests/unit/*.test.ts`) executed via `npm test`. All 164 tests across 38 suites must pass 100% green.
- **End-to-End Suite**: Playwright headless browser suite executed via `npm run test:e2e` (`npx playwright test`). All 9 tests across Desktop Chrome and Mobile Pixel 7 must pass without regressions.
- **Evidence-Based Verification**: Do not claim an implementation works without running tests and checking exit codes.

---

## 7. Deployment & Security Precautions

- Never commit real API credentials, webhook secrets, or private keys to git. Use `.env.example` as the canonical template.
- Before production container deployment, run `npm run build` or `docker compose -f docker-compose.prod.yml build` to verify Next.js standalone artifact generation.
- Ensure the Nginx reverse proxy handles SSL termination, TLS 1.3, HTTP/2, and rate-limiting zones (`solaros_req` at 30r/s, `solaros_auth` at 5r/s) in front of the Next.js process.

