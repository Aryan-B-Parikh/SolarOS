# Architecture & Technical Decisions — SolarOS

A chronological record of verified technical decisions established within the SolarOS codebase.

---

### Decision D1: Single Atomic Database Transaction per Workflow Step
- **Decision**: Every service mutation spanning multiple tables executes inside an atomic `prisma.$transaction`.
- **Why it appears to have been made**: State transitions across leads, orders, inventory reservations, dispatches, and installations touch multiple related tables. Partial failures would leave orphaned reservations or unconfirmed orders.
- **Current implementation**: Services pass the Prisma transaction client `tx` through all domain operations.
- **Files/components affected**: `src/services/orders.ts`, `src/services/payments.ts`, `src/services/dispatch.ts`, `src/services/installations.ts`.
- **Known trade-offs**: Transaction locks hold PostgreSQL connections longer under high concurrency, requiring concise transaction blocks.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D1); transaction wrappers in `src/services/payments.ts` and `src/services/installations.ts`.
- **Reason status**: Verified from ADR-001.

---

### Decision D2: Append-Only Stock Movement Ledger
- **Decision**: Inventory quantities are tracked exclusively through immutable rows in `stock_movements`. Direct overwrite of quantities is prohibited.
- **Why it appears to have been made**: Solar panels, inverters, and batteries require strict auditability down to individual serial numbers, batch numbers, and purchase costs.
- **Current implementation**: Adjustments, PO receipts, reservations, dispatches, and returns write to `stock_movements` and update cached balances in `stock_levels`.
- **Files/components affected**: `prisma/schema.prisma` (`model StockMovement`), `src/services/inventory.ts`, `src/services/dispatch.ts`.
- **Known trade-offs**: Table size grows monotonically with every warehouse event; requires periodic indexing and aggregation.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D2); `tests/unit/phase5-dispatch-rules.test.ts`.
- **Reason status**: Verified from ADR-001 and schema constraints.

---

### Decision D3: Deterministic Row-Locking on Stock Reservation
- **Decision**: Product reservations sort requested lines deterministically by `productId` ascending before acquiring database row locks.
- **Why it appears to have been made**: Concurrent orders reserving the same products in differing orders caused deadlocks in PostgreSQL.
- **Current implementation**: `src/domain/bom.ts` and `src/services/orders.ts` sort product IDs before issuing locking queries.
- **Files/components affected**: `src/domain/bom.ts`, `src/services/orders.ts`, `tests/unit/member1-stock-reservation.test.ts`.
- **Known trade-offs**: Slight CPU overhead for sorting line items before transaction execution.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D3); `tests/unit/member1-stock-reservation.test.ts`.
- **Reason status**: Verified from ADR-001 and unit tests.

---

### Decision D4: IST (+05:30) Calendar Day Boundaries
- **Decision**: All operational and financial periods (`TODAY`, `THIS_WEEK`, `THIS_MONTH`) calculate start (00:00:00.000) and end (23:59:59.999) using Indian Standard Time (`UTC+05:30`) and convert to UTC for queries.
- **Why it appears to have been made**: Technicians, installation schedules, and director dashboard financial figures operate under Indian business hours. UTC day boundaries caused transactions after 18:30 IST to appear on the next day.
- **Current implementation**: `src/lib/dates.ts` calculates precise IST time ranges.
- **Files/components affected**: `src/lib/dates.ts`, `src/services/analytics.ts`, `app/(staff)/schedule/page.tsx`.
- **Known trade-offs**: Requires explicit timezone math on every period boundary query rather than native SQL UTC dates.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D4); `tests/unit/dates.test.ts`.
- **Reason status**: Verified from ADR-001 and tests.

---

### Decision D5: Immutable Warranty Transfer Chain for RMA
- **Decision**: When defective solar equipment is replaced during service visits, the removed unit's warranty row is set to `TRANSFERRED` (never deleted) and the replacement unit inherits the exact remaining warranty duration.
- **Why it appears to have been made**: Preserves manufacturer warranty provenance and prevents customers from getting unintended warranty resets.
- **Current implementation**: `src/services/warranty.ts` links `parent_warranty_id` and retains the original expiration date.
- **Files/components affected**: `src/services/warranty.ts`, `src/services/tickets.ts`, `tests/unit/phase5-warranty.test.ts`.
- **Known trade-offs**: Warranty lookup queries must traverse replacement lineages if full unit history is requested.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D5); `member_breakdown.txt` (Q3).
- **Reason status**: Verified from ADR-001.

---

### Decision D6: Outbox Pattern for Asynchronous Customer Communications
- **Decision**: Notifications (SMS, WhatsApp, Email) are written to an `outbox` table in the database within the domain transaction, processed by a separate worker.
- **Why it appears to have been made**: Direct calls to external gateways (Twilio, MSG91, Resend) during HTTP requests introduce latency and risk rolling back transactions upon third-party network failure.
- **Current implementation**: Events inserted into `outbox` table; `src/services/outbox-worker.ts` processes pending rows with exponential backoff and dead-letter handling.
- **Files/components affected**: `src/services/outbox-worker.ts`, `app/api/v1/cron/outbox/route.ts`, `tests/unit/phase4-outbox.test.ts`.
- **Known trade-offs**: Notifications are near-real-time rather than instant; relies on cron or task execution.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D6); `src/services/outbox-worker.ts`.
- **Reason status**: Verified from ADR-001 and codebase.

---

### Decision D11: Customer Access Link Cryptographic Security
- **Decision**: Customer links (quotes, certificates, portal) use 128-bit random tokens, stored exclusively as SHA-256 hashes with last-four phone number challenge verification.
- **Why it appears to have been made**: Customers do not create traditional passwords; plain links in SMS/WhatsApp are susceptible to interception or enumeration.
- **Current implementation**: `src/lib/access-links.ts` validates hashes, checks expiration (validity + 30 days), and locks links for 15 minutes after 5 failed phone challenge attempts.
- **Files/components affected**: `src/lib/access-links.ts`, `app/(public)/portal/[token]/`, `tests/unit/access-links.test.ts`.
- **Known trade-offs**: Adds a secondary verification friction step (entering last 4 digits of phone) before showing confidential quote prices.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D11); `tests/unit/access-links.test.ts`.
- **Reason status**: Verified from ADR-001 and unit tests.

---

### Decision D17: Unified Schema & Contract Ownership by Member 1
- **Decision**: All Prisma database schemas (`prisma/`) and Zod API contract schemas (`src/contracts/`) are centrally maintained and frozen per phase.
- **Why it appears to have been made**: Multiple lanes working simultaneously would otherwise generate conflicting migrations, diverging field types, and inconsistent API responses.
- **Current implementation**: Shared contract barrel file `src/contracts/index.ts` exports typed Zod schemas used across both client and server.
- **Files/components affected**: `prisma/schema.prisma`, `src/contracts/index.ts`.
- **Known trade-offs**: Team members must coordinate schema changes through a single owner before implementing features.
- **Evidence/source in project**: `docs/adr/ADR-001-architecture-decisions.md` (ADR D17); `member_breakdown.txt` (line 3).
- **Reason status**: Verified from ADR-001 and specification.

---

### Decision D18: Multi-Stage Standalone Next.js Production Build
- **Decision**: Next.js standalone output is conditionally activated for production builds (`STANDALONE=true` and `NODE_ENV=production`), paired with PM2 and Nginx.
- **Why it appears to have been made**: In Next.js App Router 14 on Windows, unconditional `output: 'standalone'` breaks dynamic dev server route resolution. Multi-stage Docker containerization reduces image size from ~1.2 GB to ~180 MB.
- **Current implementation**: `next.config.js` conditional check, `Dockerfile` multi-stage build, `nginx/conf.d/solaros.conf` reverse proxy.
- **Files/components affected**: `next.config.js`, `Dockerfile`, `ecosystem.config.cjs`, `nginx/conf.d/solaros.conf`.
- **Known trade-offs**: Standalone output requires copying `public/` and `.next/static/` into the standalone runner directory.
- **Evidence/source in project**: `next.config.js`; `Dockerfile`; commit logs during production hardening.
- **Reason status**: Verified from implementation.

