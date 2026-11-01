# Hardening round — security, data integrity, workflow, correctness

Follows the external code review that listed the highest-risk gaps. All items
are fixed and covered by `bun run test` (scripts/e2e-demo.mjs, 66 assertions).

## Security
- **Portal takeover (P27/D11)**: `POST /public/enquiries` with an existing
  customer's phone no longer returns the raw token and never revokes the
  customer's link. Portal links are PERSISTENT: `issueLink` re-sends the active
  link (token sealed with AES-256-GCM in `CustomerAccessLink.tokenEnc`) instead
  of replacing it. Only brand-new customers see a token inline.
- **Last-4 verification (P83)**: enforced server-side on quote accept/reject,
  ticket raise/confirm/reopen and the payment history. A successful check
  yields a 30-minute verified state in an httpOnly cookie bound to the token
  (`src/lib/portal-verify.ts`). `phoneLast4` removed from the portal bundle.
- **Files are private (D14)**: `GET /files/[id]` requires a presigned 5-minute
  HMAC URL (issued only after a token check — the portal bundle signs gallery
  photos), a staff session, or a portal token with an ownership check.
- **Field routes (P77)**: start/update/signoff/hold require the assigned crew
  or the DIRECTOR (`requireJobAccess`).
- **Director-only (T38R7)**: order confirm-override and cancel; cron jobs are
  DIRECTOR-only without `x-cron-secret` (D10).
- **Login lockout**: 10 failed logins lock an account 15 minutes
  (`User.failedLogins/lockedUntil`) + per-IP rate limit on the login route.
- **Sessions**: 12 idle hours for staff, 30 days for field technicians
  (`Session.lastSeenAt` sliding window).

## Data integrity (D1/D2/D3)
- `recordPayment` (with the whole auto-confirm cascade), `confirmOrder`,
  `cancelOrder`, `reallocateOrderShortages`, `scheduleInstallation`,
  `scanUnit`, `depart`, `deliver`, `signoffJob`, `updateQuoteLines`,
  `createOrderFromQuote` all run inside `prisma.$transaction`.
- Stock reservation/release/depart moves use compare-and-swap guarded
  `updateMany` (`casReserve` / `casRelease` / `casAdjustStock`) — concurrent
  confirms cannot overbook.
- `enqueue`/`audit`/`nextNumber` accept a transaction client so outbox rows,
  audit rows and number sequences commit atomically with the writes.
- Database hardening (`scripts/db/triggers.sql`): 13 triggers (CHECK-style
  guards for positive payment amounts, non-negative money, non-negative stock,
  warranty date order, sign-off proof hash), 3 partial unique indexes (one live
  dispatch per unit, one ACTIVE warranty per unit) and 4 reporting views
  (`v_available_stock`, `v_order_balance`, `v_receivables`, `v_warranty_active`).
- `cancelOrder` now also un-picks scanned units back to the warehouse, cancels
  the dispatch and records the refund (reversal rows per received payment).
  `depart` refuses a cancelled order.

## Workflow
- **P158 lifecycle**: `updateJob` auto-moves a finished job (checklist + 3
  named photos + capacity + reading) to `AWAITING_SIGNOFF`; sign-off requires
  that state and a `DELIVERED` order (a fully-complete IN_PROGRESS job is
  promoted on a direct sign-off attempt).
- **D16 idempotency**: `IdempotencyKey` table stores the response;
  `withIdempotency` wired into dispatch scan, quote acceptance, sign-off and
  (already) payments.

## Correctness
- Quote capacity comes from the chosen system template (no 5 kW inverter with
  3 kW panels); BOM rejects a system template with no inverter — a SERVICE
  line no longer bypasses the check (only PANEL_SET templates are excused).
- GST is charged on the discounted amount; revising a quote carries the
  discount (and a director approval) over.
- Manual quote-line edit (`POST /quotes/{id}/lines`) and offline acceptance
  (`POST /quotes/{id}/accept`) with a full audit trail; UI in views-quotes.
- Final invoice is ALWAYS issued at completion and covers the outstanding
  balance (single balance line when an advance was receipted).
- Payment reversal flow (`POST /orders/{id}/reverse-payment`) + UI button.
- Calendar dates are IST everywhere (D9): services use `istToday()`, the
  client helpers add the +5:30 offset.
- Hold/reschedule notify the customer and re-run crew suggestions; rescheduling
  works after READY_TO_DISPATCH (and never regresses the order status).
- "Today" list shows only today's installs plus carry-overs in progress.
- Outbox recipients resolve real staff/customer contacts (no placeholders).
- Fixed pre-existing double-wrap bug in `GET /quotes/{id}` (route re-wrapped
  `quoteDetail`'s `{quote}` payload, crashing QuoteDetailView).
