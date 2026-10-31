# Architecture Decision Records (ADRs) — SolarOS

## ADR D1: Single Atomic Database Transaction per Workflow Step
- **Context**: State transitions across leads, orders, inventory reservations, dispatches, and installations span multiple tables.
- **Decision**: Every service mutation runs in a single `prisma.$transaction`. Cross-service calls pass the active transaction handle.
- **Consequence**: Zero half-applied state; eliminates orphan reservations or partially confirmed orders.

## ADR D2: Append-Only Stock Movement Ledger
- **Context**: Inventory quantities cannot be directly updated via arbitrary writes.
- **Decision**: All stock adjustments, receipts, reservations, dispatches, and RMA returns occur through immutable rows in `stock_movements`.
- **Consequence**: Full auditability down to the individual serial number and batch; negative balances prevented by database constraints.

## ADR D3: Deterministic Row-Locking on Stock Reservation
- **Context**: Parallel orders for identical solar panel SKUs can deadlock if row updates occur in arbitrary sequence.
- **Decision**: Product reservations sort lines deterministically by `productId` ascending before acquiring lock.
- **Consequence**: Database deadlocks eliminated during peak quotation acceptances.

## ADR D4: IST (+05:30) Calendar Day Boundaries
- **Context**: Solar installation schedules, customer deadlines, and financial metrics depend on Indian Standard Time.
- **Decision**: All business periods (`TODAY`, `THIS_WEEK`, `THIS_MONTH`) calculate start (00:00:00.000) and end (23:59:59.999) in IST and convert to UTC for database querying.
- **Consequence**: Consistent period-over-period financial figures matching local business hours.

## ADR D5: Immutable Warranty Transfer Chain
- **Context**: When defective solar equipment is replaced under RMA, the customer's warranty duration must not be arbitrarily restarted or lost.
- **Decision**: The removed unit's warranty row is marked `TRANSFERRED` (never deleted); a successor warranty is created inheriting the exact original `end_date` and linking `parent_warranty_id`.
- **Consequence**: Complete equipment provenance preserved for manufacturer warranty claims.

## ADR D6: Outbox Pattern for Asynchronous Notifications
- **Context**: SMS and email delivery to customers must not block web request transactions.
- **Decision**: Messages are written to `outbox` table in the same transaction as the domain event. A background cron worker processes the queue with exponential backoff (1m, 5m, 15m, 1h, 6h).
- **Consequence**: Transient email/SMS gateway failures never roll back user transactions.

## ADR D11: Customer Access Link Security via Cryptographic Hashing
- **Context**: Customers access quotes, installation certificates, and service tickets without username/password accounts.
- **Decision**: 128-bit random tokens are generated; only SHA-256 hashes are stored in `customer_access_links`. Sensitive actions require phone verification (last 4 digits). Five wrong attempts lock the link for 15 minutes.
- **Consequence**: Database leaks never expose valid links; brute-force attacks are thwarted.

## ADR D13: Service-Layer Authorization Enforcement
- **Context**: Client UI routing checks can be bypassed by direct API calls.
- **Decision**: RBAC matrix permissions (`can` and `requireRole`) are verified in backend API route handlers and service methods.
- **Consequence**: Defense in depth; field devices or API clients cannot escalate privileges.

## ADR D17: Unified Contract Ownership by Member 1
- **Context**: Parallel full-stack development across multiple team members can cause contract drift.
- **Decision**: Database schema (`prisma/`) and API contracts (`src/contracts/`) have a single owner (Member 1).
- **Consequence**: Predictable API compatibility, zero breaking schema collisions, and automated OpenAPI documentation.

