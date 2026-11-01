# Task 2-c — Inventory/PO/Returns/Payments MVP gaps (work record)

Agent: 2-c · Date: 2026-10-31 · Project: /home/z/my-project (SunPower solar ops, Next.js 16 + Prisma/SQLite)

## What was implemented

### FR-5.2 + FR-5.9 — QR warranty labels
- NEW `src/lib/qr.ts`: shared `qrDataUrl(text)` (qrcode → PNG data URL, margin 1, width 160) + `warrantyUrl(origin, code)` building the ABSOLUTE public URL `${origin}/w/${code}` (fallback origin `http://localhost:3000`).
- `src/services/inventory.ts` `receiveStock`: accepts `origin` param (services stay request-agnostic); every serialized unit label now carries `qrDataUrl` encoding the absolute `/w/{qrCode}` URL. POST receipt response shape `{ receipt, labels: [{ serial, qr, product, qrDataUrl }] }` matches what `views-inventory.tsx` renders (`<img src={unit.qrDataUrl}>`).
- `src/app/api/v1/inventory/receipts/route.ts` POST: reads `Origin` header, passes to service.
- `src/app/api/v1/inventory/receipts/[id]/route.ts` GET: reuses the same helper; old receipts print labels with the same absolute-URL scheme.

### FR-5.3 — Stock view + low-stock alerts
- `checkLowStock` now ALSO emails active WAREHOUSE users (falls back to the seeded `warehouse@sunpower.example`) in addition to the director (template LOW_STOCK, 2 outbox rows verified).
- `stockOverview` aggregates one row per product AND location (location name via StockLevel→StockLocation; unstocked products keep a single zero row with `locationId/locationName = null`). Rows expose `locationId`, `locationName`, onHand/reserved/available per location.
- UI `StockView`: new Location column; per-location row keys; horizontal scroll for the wider table.

### FR-5.7 — Returns with reason, audited
- NEW `src/app/api/v1/inventory/returns/route.ts` POST `{ productId, unitId?, qty>0, reason(min 3), orderId? }` (stock.write) → service `recordReturn`: StockMovement type `RETURN`, refType `return`, reason stored; onHand incremented (StockLevel upserted if missing); serialized units are put back IN_STOCK at WH1; audited incl. reason.
- UI: compact "Record return" Dialog in StockView (product, qty, optional serial/QR lookup via `/inventory/units?code=`, required reason).

### FR-5.8 — Purchase orders
- NEW `src/app/api/v1/purchase-orders/[id]/route.ts` GET detail (supplier, lines+products, receipts).
- NEW `src/app/api/v1/purchase-orders/[id]/cancel/route.ts` POST `{ reason(min 3) }` (purchasing.write) → service `cancelPurchaseOrder`: only OPEN/PARTIAL cancellable → CANCELLED + audit; otherwise 409/400.
- UI: Cancel button on OPEN/PARTIAL PO rows (reason prompt); low-stock rows get "Draft PO" which opens Purchasing with the New-PO form prefilled, suggested qty = `max(reorderLevel*2 − available, 1)`, unit cost from stdCost (module-level prefill survives the view switch; supplier falls back to the first one until chosen).

### FR-4.5 — Shortages can now be covered
- NEW `src/services/orders.ts` `reallocateOrderShortages(orderId, actorId)`: for CONFIRMED orders, (re)creates/extends ACTIVE StockAllocation rows up to now-available per product+location (WH1, matching confirmOrder; SERVICE lines skipped), bumps `stockLevel.reserved` and `orderLine.qtyReserved` — the exact source of truth the dispatch/schedule gate reads (orders.ts `scheduleInstallation` + dispatch trigger flow). Audits `shortage_reallocated` when covered > 0.
- `receiveStock` hooks it in: after levels are raised, CONFIRMED orders having a short line on any received product are reallocated (`coverShortagesFor`). Verified live demo order SO-2026-0031 (fully reserved, CONFIRMED) is untouched; SO-2026-0029 (PENDING_ADVANCE) not eligible by design.
- UI: order shortage banner gained the line "Received stock is allocated automatically — shortages clear when covered."

### FR-4.2 — Payment kind selector
- `views-orders.tsx` PaymentForm: Kind select ADVANCE/PART/FINAL (default ADVANCE); Method select already offers UPI/NEFT/CASH/CHEQUE/LOAN (kept); kind sent to POST `/orders/{id}/payments` (API zod enum already accepts these).

## Files changed
| File | Summary |
|---|---|
| src/lib/qr.ts | NEW shared qrcode helper: `qrDataUrl` + `warrantyUrl` absolute /w/{code} |
| src/services/inventory.ts | origin-aware labels with qrDataUrl; per-product+location stockOverview; warehouse low-stock email; recordReturn; cancelPurchaseOrder + purchaseOrderDetail; receipt→shortage reallocation hook |
| src/services/orders.ts | NEW exported `reallocateOrderShortages` (allocation + qtyReserved source of truth + audit) |
| src/app/api/v1/inventory/receipts/route.ts | POST passes Origin header into service |
| src/app/api/v1/inventory/receipts/[id]/route.ts | label-data endpoint uses shared qr helper with absolute warranty URL |
| src/app/api/v1/inventory/returns/route.ts | NEW POST returns endpoint (zod + stock.write) |
| src/app/api/v1/purchase-orders/[id]/route.ts | NEW GET PO detail |
| src/app/api/v1/purchase-orders/[id]/cancel/route.ts | NEW POST cancel { reason } |
| src/components/app/views-inventory.tsx | Location column, Record-return dialog, PO cancel button, low-stock Draft PO prefill, alert copy updated |
| src/components/app/views-orders.tsx | Payment kind selector; shortage banner auto-allocation note |

Untouched per instructions: schema, auth/settings/api/lib.ts, other views, dispatch/analytics/tickets/quotes services. Did not restart dev server (HMR only).

## Verification results
1. `bun run lint` → **0 errors, 1 warning** (pre-existing unused eslint-disable in shared.tsx — not this task's file). `tsc --noEmit` clean (fixed one TS2353 by typing the labels array).
2. Smoke (warehouse@sunpower.example / demo1234):
   - POST /inventory/receipts (DC-CBL-4 50m non-serialized + INV-ONG-1K 1 serialized unit, Origin header) → 200, GRN-2026-0005, labels[0].qrDataUrl present; decoded payload verified byte-identical to QR of `http://localhost:3000/w/SP23312919`.
   - GET /inventory/receipts/{id} → 200, labels with same absolute-URL qrDataUrl.
   - GET /inventory/stock → 20 rows, `locationName: "Main warehouse (Vatva)"`, onHand/reserved/available per location; DC-CBL-4 1121→1171 after receipt.
   - POST /inventory/returns {qty 5, reason} → 200, onHand 1176 (+5), RETURN movement + audit(row includes reason); reason<3 → 400; serialized branch (unitId) → unit back IN_STOCK @ WH1, +1 onHand.
   - POST /purchase-orders → PO-2026-0002 OPEN; GET /purchase-orders/{id} → detail; POST …/cancel {reason} → ok + audit; second cancel → 409.
   - Director jar GET /orders/{SO-2026-0031} → 200, payments ledger intact (kinds ADVANCE). No order/dispatch mutations on live demo data.
   - Outbox: LOW_STOCK → director + warehouse rows created.
3. DB triggers: `['trg_dispatch_gate']` still present.
4. dev.log: compiles clean; only stale pre-session errors (EADDRINUSE line 3, useSyncExternalStore line 565) from before this task.

## Left outside scope / notes
- reallocateOrderShortages E2E happy-path not exercised live (no CONFIRMED short order exists; creating one would pollute demo pipeline). Covered by receipt-path execution (query + no-op) and code review; SO-2026-0031 verified untouched (12 lines, ΣqtyReserved 95 unchanged).
- PO create API kept as-is per task (UI-level prefill only).
- Smoke artifacts (GRN-2026-0005, PO-2026-0002 CANCELLED, 2 RETURN movements, +56m DC-CBL-4/+1 INV-ONG-1K stock) are additive demo data only.
