# SunPower Solar Installation Management System (SunPower Ops)

A modular-monolith web application built with Next.js (App Router), TypeScript, PostgreSQL, and Prisma. The system manages the entire solar installation lifecycle—from initial web/WhatsApp enquiry, technical rooftop survey, AI site assessment, and dynamic BOM quotation to warehouse dispatch scanning, field PWA installation, and 20-year equipment warranty tracking.

---

## Architecture Decisions (ADR Reference)

- **D1 [Modular Monolith]**: Next.js + TypeScript + PostgreSQL + Prisma with enforced module boundaries. CRM, Quotation, Inventory, Installation, Warranty, and Service interact only via service interfaces and shared transactions.
- **D2 [Append-Only Inventory Ledger]**: Stock movements are recorded in an append-only `stock_movements` ledger with a row-locked `stock_levels` table for fast O(1) balance lookups.
- **D3 [Three-State Inventory Quantities]**: Stock is tracked as *On-hand*, *Reserved*, and *Available = On-hand - Reserved*. Stock is reserved at order confirmation and physically reduced at dispatch scanning under `SELECT ... FOR UPDATE` row locks.
- **D4 [Serialized Inventory Allocation]**: Items are reserved by quantity at order confirmation and bound to specific physical serial numbers during warehouse dispatch scanning.
- **D5 [Unit-Bound Warranty Tracking]**: Equipment warranties are tied directly to physical `inventory_units` records. Replacements inherit remaining warranty duration (`parent_warranty_id`) while the original record is marked `TRANSFERRED` (never deleted).
- **D6 [Transactional Outbox]**: Notifications and SMS/email alerts are written to the `outbox` table within the domain transaction and processed with exponential retry intervals (5m, 15m, 1h, 6h, 24h).
- **D7 [Deterministic Calculators with Advisory AI]**: Pure deterministic domain engines handle all financial sizing, pricing, and BOM generation. AI models provide natural-language summaries and advisory rooftop observations without altering mathematical calculations.
- **D8 [Field PWA]**: Mobile-first Progressive Web App for field engineers, featuring camera barcode/QR scanning, touch signature pads, and resilient draft caching.
- **D9 [Integer Currency & IST Calendar Dates]**: All financial amounts are stored as integer paise (`bigint`) with Indian lakh grouping formatting (`Rs 1,50,000`). Dates are handled in Asia/Kolkata (`UTC+5:30`).
- **D10 [Connection Pooling & Zero Microservices Overhead]**: Single deployable architecture optimized for ~40 projects/month without unnecessary message brokers or cache servers.
- **D11 [Secure Customer Access Links]**: No customer password registration required. Access to quotes, certificates, and the customer portal is granted via 128-bit cryptographically secure tokenized links (stored as SHA-256 hashes).
- **D12 [Comprehensive Audit Logging]**: Complete audit trails for financial, inventory, and status mutations, including customer portal actions and duplicate lead dismissals.
- **D13 [Backend-Enforced RBAC]**: Role-based access control (`DIRECTOR`, `SALES`, `TECHNICIAN`, `WAREHOUSE`, `SUPPORT`, `ACCOUNTS`) strictly enforced at the backend service layer.
- **D14 [Private Object Storage]**: S3-compatible storage with 5-minute expiring presigned URLs for survey photos, completion photos, customer signatures, and PDFs.
- **D15 [Outbox Delivery Tracking]**: Delivery statuses tracked from `QUEUED` to `SENT` and `DELIVERED`, with automatic dead-letter alerting after 5 failed attempts.
- **D16 [Universal Idempotency]**: Critical operations (payments, quote acceptances, dispatch scans, installation sign-offs) require client-generated UUID idempotency keys.
- **D17 [Single Schema & Contract Ownership]**: Member 1 owns `prisma/` and the shared Zod API contracts (`src/contracts/`).

---

## 53-Table Schema Structure

The PostgreSQL database encompasses 53 relational tables organized into 11 functional domains:

1. **Identity & Auth**: `users`, `sessions`, `technicians`, `technician_leave`, `settings`, `number_sequences`
2. **Customers & CRM**: `customers`, `customer_access_links`, `leads`, `lead_activities`, `lead_duplicate_flags`
3. **Survey & Assessment**: `site_surveys`, `site_assessments`
4. **Catalogue & BOM**: `products`, `system_templates`, `template_bom_lines`, `fault_codes`
5. **Sales & Quotations**: `quotes`, `quote_lines`
6. **Finance & Orders**: `orders`, `order_lines`, `payments`, `invoices`, `invoice_lines`, `expenses`, `subsidy_applications`
7. **Inventory & Purchasing**: `stock_locations`, `stock_levels`, `stock_movements`, `suppliers`, `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, `purchase_receipt_lines`, `inventory_units`, `stock_allocations`
8. **Dispatch Operations**: `dispatches`, `dispatch_lines`, `dispatch_units`
9. **Field Operations**: `installations`, `installation_crew`, `crew_suggestions`, `time_logs`
10. **Service & Warranty**: `warranties`, `service_tickets`, `ticket_parts`, `ticket_events`, `maintenance_alerts`
11. **Platform Infrastructure**: `attachments`, `outbox`, `audit_log`, `share_links`, `idempotency_keys`

---

## Quickstart & Local Development

### 1. Prerequisites
- Node.js v20+ or v22+
- Docker Desktop or PostgreSQL 16+

### 2. Start PostgreSQL & Storage Containers
```bash
docker compose up -d
```

### 3. Setup Environment Variables
```bash
cp .env.example .env
```

### 4. Database Migration & Seed
```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

### 5. Run Tests
```bash
npm run test
```

### 6. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Phase 0 Checklist (Member 1 - Backend Architecture)

- [x] Project scaffolding (Next.js 14 App Router, TypeScript strict, Tailwind CSS, ESLint, Prettier, Vitest)
- [x] Complete Prisma schema for all 53 tables across all 11 modules (`prisma/schema.prisma`)
- [x] SQL constraints, partial unique indexes, database triggers, and views (`prisma/migrations/0002_constraints.sql`)
  - `stock_levels` non-negative and reserved validation
  - `dispatch_guard` trigger preventing transit with unfulfilled lines
  - `warranties_one_active_per_unit` partial unique index
  - Real-time views: `v_stock_available`, `v_unit_warranty`, `v_project_profitability`, `v_pending_steps`, `v_revenue_trend`, `v_customer_timeline`
  - Append-only ledger protection with table REVOKEs
- [x] Shared Zod API contracts (`src/contracts/index.ts`)
- [x] Core library helpers:
  - `src/lib/money.ts`: Integer paise math & Indian lakh grouping formatting (`Rs 1,50,000`)
  - `src/lib/dates.ts`: IST calendar calculations, add months, warranty end dates
  - `src/lib/rbac.ts`: Role-based permissions matrix & guards
  - `src/lib/auth.ts`: Argon2id password hashing & database sessions
  - `src/lib/access-links.ts`: 128-bit cryptographically secure link tokens, SHA-256 hashing, 5-strike lockouts
  - `src/lib/errors.ts`: Standard error format `{ error: { code, message, details, requestId } }`
  - `src/lib/logger.ts`: Structured JSON logging with phone masking and token redaction
  - `src/lib/idempotency.ts`: Idempotency key tracking and response verification
  - `src/lib/audit.ts`: Immutable audit logging for staff and customer actions
  - `src/lib/outbox.ts`: Transactional outbox pattern with exponential retry schedule
  - `src/lib/handler.ts`: Reusable API route handler wrapper with validation and RBAC
- [x] Idempotent seed script (`prisma/seed.ts`):
  - 1 Director, 2 Sales, 15 Technicians (4 Crew Leads), 1 Warehouse, 1 Support, 1 Accounts
  - 20 Products catalogue with rated power, warranty months, and start basis
  - 10 System Templates (On-Grid & Off-Grid 1–5 kW) + 3 kW BOM lines
  - Main warehouse inventory with 8+ typical jobs stock and 1 low-stock alert item
  - Historical May 2025 (in warranty) and March 2023 (out of warranty) demo installations
- [x] Unit test suites:
  - `tests/unit/money.test.ts`
  - `tests/unit/dates.test.ts`
  - `tests/unit/access-links.test.ts`
  - `tests/unit/rbac.test.ts`
- [x] CI/CD configuration (`.github/workflows/ci.yml`)
- [x] Docker environment (`docker-compose.yml`)

