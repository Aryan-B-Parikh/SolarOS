# Current State Snapshot — SolarOS

**Snapshot Date**: 31 October 2026  
**System Status**: All 10 Phases (Phase 0 to 9) implemented, 164 unit tests passing, 9 Playwright E2E browser tests passing, seeded PostgreSQL database active on port 5432.

---

## 1. Project Purpose
SolarOS is a production-grade enterprise operations platform designed for Indian rooftop solar EPC (Engineering, Procurement, and Construction) companies. It handles the complete customer and operational lifecycle:
- Public customer solar enquiry and portal access
- Sales CRM lead management, deduplication, and SLA tracking
- On-site rooftop survey, solar PV assessment calculation, and AI multimodal roof analysis
- BOM generation with automatic margin validation and branded PDF quote issuance
- Advance payment collection (Razorpay webhooks), inventory reservation, and installation scheduling
- Warehouse serialized inventory receiving, PO management, QR labels, and dispatch picking
- Field technician PWA with job stepper, checklist, photo evidence, digital signature, and certificate generation
- Service desk ticketing, warranty tracking, RMA unit replacement, and chargeable invoicing
- Director financial analytics, gross margin reporting, and predictive maintenance jobs

---

## 2. Technology Stack
- **Framework**: Next.js 14.2.33 (App Router, Server Components & Client Components)
- **Language**: TypeScript 5.4 (Strict mode enabled)
- **Database & ORM**: PostgreSQL 16/18 with Prisma ORM 5.17 (53 models, views, constraints)
- **Styling**: Tailwind CSS 3.4 with custom SolarOS solar-dark tokens
- **Component Primitives**: Radix UI / custom shadcn-styled accessible components
- **Validation**: Zod 3.23 (shared across client and server API contracts)
- **Testing**:
  - Node.js native test runner (`node --experimental-strip-types --test`)
  - Playwright Test 1.58+ (Chromium, Desktop Chrome, Pixel 7 mobile emulation)
- **Production Server & Deployment**:
  - Node.js 20/24 standalone runner
  - PM2 cluster process supervisor
  - Nginx reverse proxy (TLS 1.3, HTTP/2, rate limiting, gzip)
  - Docker & Docker Compose

---

## 3. Directory Structure
```
SolarOS/
├── ai/                     # AI Agent Brain documentation suite
│   ├── current-state.md
│   ├── decisions.md
│   ├── instructions.md
│   └── known-issues.md
├── app/                    # Next.js 14 App Router
│   ├── (field)/            # Mobile Field Technician PWA (/tech/today, /tech/jobs, /tech/scan)
│   ├── (public)/           # Public Homeowner Portal (/enquiry, /portal, /q/[token], /w/[code])
│   ├── (staff)/            # Staff Operations Portal (/dashboard, /leads, /quotes, /orders, /inventory, /service)
│   ├── api/                # REST API routes (/api/v1/*, /api/health)
│   ├── layout.tsx
│   └── page.tsx
├── deployment/             # Universal Deployment & DevOps suite
│   ├── build.md
│   ├── deployment.md
│   ├── environments.md
│   ├── release-checklist.md
│   └── rollback.md
├── docs/                   # Engineering documentation, ADRs, runbooks
│   └── adr/
├── nginx/                  # Production Nginx reverse proxy configuration
│   ├── conf.d/solaros.conf
│   └── nginx.conf
├── prisma/                 # Database schema and seed data
│   ├── migrations/
│   ├── schema.prisma       # 53 data models
│   └── seed.ts             # Idempotent seed script
├── src/                    # Source code
│   ├── components/         # Shared UI components (Scanner, OfflineBanner, etc.)
│   ├── contracts/          # Zod validation schemas for API endpoints
│   ├── domain/             # Pure business engines (BOM, warranty, reservation, scoring)
│   ├── lib/                # Utilities (db, money, dates, ai, access-links, errors)
│   └── services/           # Backend database queries and domain mutation workflows
├── tests/
│   ├── e2e/                # Playwright browser end-to-end test suite
│   └── unit/               # Node test runner unit & integration test suite
├── Dockerfile              # Production multi-stage container build
├── docker-compose.prod.yml # Production multi-container compose definition
├── ecosystem.config.cjs    # PM2 cluster configuration
├── package.json
└── playwright.config.ts    # Playwright configuration
```

---

## 4. Frontend Flow
1. **Public Homeowner Journey**:
   - `/enquiry`: Homeowner enters roof details, monthly electricity bill, and phone number.
   - `/portal/[token]`: Secure link sent via SMS/WhatsApp with phone number verification (last 4 digits). Homeowner tracks milestone progress: Enquiry → Survey → Quote → Order → Installation → Warranty.
   - `/q/[token]`: Interactive quotation review with detailed BOM breakdown, subsidy estimate, and digital acceptance or rejection.
   - `/w/[code]`: Public warranty verification lookup for serialized panels and inverters.
2. **Staff Operational Dashboard**:
   - `/dashboard`: Director overview with pipeline KPIs, revenue, gross margin, and urgent operational alerts.
   - `/leads`: Kanban CRM board for managing customer leads through stages with duplicate detection flags.
   - `/quotes` & `/quotes/new`: Sizing engine and quote builder with 5 BOM rules, discount authorization guards, and PDF generation.
   - `/orders`: Orders pipeline tracking advance payment receipt, reservation status, and installation readiness.
   - `/schedule`: Technician calendar grid with crew matching and hard constraint validation.
   - `/inventory` & `/purchasing`: Warehouse stock overview, purchase order creation, serial receipt, and unit drilldown.
   - `/dispatch`: Loading queue and picking verification scanner.
   - `/service`: Service desk ticketing, warranty verdicts, fault codes, RMA replacement, and invoice generation.
3. **Mobile Field Technician PWA**:
   - `/tech/today`: Daily scheduled job agenda with customer directions and contact details.
   - `/tech/jobs/[id]`: Installation stepper with mandatory 5-step checklist, 3+ photo capture, customer signature pad, and SHA-256 completion certificate generation.
   - `/tech/scan`: Barcode and QR camera scanner for equipment picking and field serial verification.

---

## 5. Backend Flow & State Machines
- **Lead Lifecycle**: `NEW` → `CONTACTED` → `QUALIFIED` → `SURVEY_SCHEDULED` → `SURVEY_APPROVED` → `QUOTED` → `WON` (or `LOST` / `DISQUALIFIED`).
- **Order Lifecycle**: `PENDING_ADVANCE` → `CONFIRMED` (on 30% advance) → `READY_TO_DISPATCH` → `DISPATCHED` → `DELIVERED` → `INSTALLED` → `CLOSED`.
- **Stock Movement Engine**: All inventory changes (Receipts, Reservations, Dispatches, Returns) log immutable entries in `stock_movements`, updating cached totals in `stock_levels`.
- **Warranty State Machine**: Units activate warranties upon `DELIVERY` or `INSTALLATION_SIGNOFF`. Replaced RMA units transition to `TRANSFERRED`, inheriting remaining duration.

---

## 6. Authentication & Authorization
- **Staff Sessions**: Session-based credentials with Argon2id password hashing and database session tokens stored in `sessions` table.
- **Role-Based Access Control (RBAC)**: 6 roles (`DIRECTOR`, `SALES`, `TECHNICIAN`, `WAREHOUSE`, `SUPPORT`, `ACCOUNTS`) enforced via `requireRole` and `can()` permission matrix in `src/lib/rbac.ts`.
- **Customer Access**: Stateless 128-bit random tokens with SHA-256 hash storage in `customer_access_links`. Sensitive actions require phone verification (last 4 digits) with 15-minute temporary lockout after 5 consecutive failures.

---

## 7. External Integrations & Gateways
- **Payment Gateway**: Razorpay webhook signature verification (HMAC-SHA256) and order creation in `src/services/payments.ts`. Automatic advance order confirmation and stock reservation on capture.
- **SMS & WhatsApp**: MSG91 Flow SMS and Twilio WhatsApp REST dispatch via `src/services/outbox-worker.ts` with sandbox logging fallback.
- **AI Roof Analysis**: Google Gemini 1.5 Flash multimodal vision API (`generateContent` with image parts and JSON structured response schema) in `src/lib/ai.ts` with deterministic fallback.
- **Object Storage**: S3-compatible client (`@aws-sdk/client-s3`) configured for Cloudflare R2 / AWS S3 (or local MinIO).

---

## 8. Build, Run & Verification Process
- **Local Dev Server**: `npx next dev -p 3000` (Postgres on port 5432).
- **Unit & Integration Suite**: `npm test` runs 164 tests in 1.57s.
- **End-to-End Suite**: `npm run test:e2e` runs 9 Playwright browser tests across Desktop Chrome and Pixel 7 in 17.3s.
- **Production Build**: `npm run build` generates optimized Next.js standalone bundle.
- **Docker Stack**: `docker compose -f docker-compose.prod.yml up -d --build`.

---

## 9. Current Feature Status
| Module | Status | Verification Evidence |
|---|---|---|
| Schema & Seed Data (53 tables) | 100% Complete | Seeded with 21 users, leads, quotes, orders, inventory |
| Public Customer Enquiry & Portal | 100% Complete | Playwright E2E passed (Desktop & Pixel 7) |
| Leads CRM & Deduplication | 100% Complete | Unit tests & E2E passed |
| Solar PV Assessment & AI Vision | 100% Complete | Pure calculator & Gemini 1.5 Flash tests passed |
| BOM Engine & Branded Quotes | 100% Complete | 5 BOM rules verified; PDF generation tested |
| Advance Payments & Razorpay Webhook | 100% Complete | Live HMAC-SHA256 capture tested; DB updated |
| Crew Scheduling & Hard Constraints | 100% Complete | Unit scorer & calendar grid verified |
| Inventory, POs & Barcode/QR Scanner | 100% Complete | E2E and receiving integration tests passed |
| Field Tech PWA & Digital Sign-off | 100% Complete | Playwright Pixel 7 PWA stepper test passed |
| Service Desk, Tickets & RMA Warranty | 100% Complete | Warranty transfer chain and E2E passed |
| Profitability Analytics & Alerts | 100% Complete | Gross margin query & alerts widget verified |
| Outbox Worker (SMS/WhatsApp/Email) | 100% Complete | Unit retry tests & REST dispatch verified |
| Reverse Proxy & Production Hardening | 100% Complete | Dockerfile, PM2, Nginx configs in place |

