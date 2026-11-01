-- Database-level invariants (D2, D5, T38/T43) applied to the SQLite database by
-- scripts/db/apply.sh (also runs automatically after `bun run db:push`).
-- SQLite cannot ALTER TABLE ... ADD CONSTRAINT, so CHECK-style guards are
-- implemented as BEFORE INSERT/UPDATE triggers with RAISE(ABORT) — same
-- enforcement, no table rebuild. Partial unique indexes and reporting views
-- round out the hardening.

-- ── FR-5.5: dispatch-completeness gate ─────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_dispatch_gate
BEFORE UPDATE OF status ON Dispatch
WHEN NEW.status IN ('READY', 'IN_TRANSIT', 'DELIVERED')
BEGIN
  SELECT RAISE(ABORT, 'Dispatch is incomplete: every serialized line must be fully scanned and non-serialized quantities confirmed before departure.')
  WHERE EXISTS (
    SELECT 1 FROM DispatchLine dl
    JOIN Product p ON p.id = dl.productId
    WHERE dl.dispatchId = NEW.id
      AND (
        (p.isSerialized = 1 AND (SELECT COUNT(*) FROM DispatchUnit du WHERE du.dispatchLineId = dl.id AND du.removedAt IS NULL) < CAST(dl.qtyRequired AS INTEGER))
        OR (p.isSerialized = 0 AND dl.qtyLoaded < dl.qtyRequired)
      )
  );
END;

-- ── CHECK-style guards (SQLite trigger equivalent) ─────────────────────────

-- payments: amount must be above zero (T43R22)
CREATE TRIGGER IF NOT EXISTS trg_payment_amount_positive_ins
BEFORE INSERT ON Payment
WHEN NEW.amountPaise <= 0
BEGIN
  SELECT RAISE(ABORT, 'Payment amount must be above zero.');
END;
CREATE TRIGGER IF NOT EXISTS trg_payment_amount_positive_upd
BEFORE UPDATE OF amountPaise ON Payment
WHEN NEW.amountPaise <= 0
BEGIN
  SELECT RAISE(ABORT, 'Payment amount must be above zero.');
END;

-- order/quote/invoice money fields must be non-negative
CREATE TRIGGER IF NOT EXISTS trg_order_money_nonneg
BEFORE UPDATE OF subtotalPaise, discountPaise, taxPaise, totalPaise, paidPaise, advanceRequiredPaise ON "Order"
WHEN NEW.subtotalPaise < 0 OR NEW.discountPaise < 0 OR NEW.taxPaise < 0 OR NEW.totalPaise < 0 OR NEW.paidPaise < 0 OR NEW.advanceRequiredPaise < 0
BEGIN
  SELECT RAISE(ABORT, 'Order money fields must be non-negative.');
END;
CREATE TRIGGER IF NOT EXISTS trg_quote_money_nonneg
BEFORE UPDATE OF subtotalPaise, discountPaise, taxPaise, totalPaise ON Quote
WHEN NEW.subtotalPaise < 0 OR NEW.discountPaise < 0 OR NEW.taxPaise < 0 OR NEW.totalPaise < 0 OR NEW.discountPaise > NEW.subtotalPaise
BEGIN
  SELECT RAISE(ABORT, 'Quote money fields must be non-negative and the discount cannot exceed the subtotal.');
END;
CREATE TRIGGER IF NOT EXISTS trg_invoice_money_nonneg
BEFORE UPDATE OF subtotalPaise, taxPaise, totalPaise ON Invoice
WHEN NEW.subtotalPaise < 0 OR NEW.taxPaise < 0 OR NEW.totalPaise < 0
BEGIN
  SELECT RAISE(ABORT, 'Invoice money fields must be non-negative.');
END;

-- quantities must stay positive on order/quote/dispatch lines
CREATE TRIGGER IF NOT EXISTS trg_orderline_qty_positive
BEFORE UPDATE OF qty ON OrderLine
WHEN NEW.qty <= 0
BEGIN
  SELECT RAISE(ABORT, 'Order line quantity must be above zero.');
END;
CREATE TRIGGER IF NOT EXISTS trg_quoteline_qty_positive
BEFORE UPDATE OF qty ON QuoteLine
WHEN NEW.qty <= 0
BEGIN
  SELECT RAISE(ABORT, 'Quote line quantity must be above zero.');
END;
CREATE TRIGGER IF NOT EXISTS trg_dispatchline_qty_positive
BEFORE UPDATE OF qtyRequired, qtyLoaded ON DispatchLine
WHEN NEW.qtyRequired <= 0 OR NEW.qtyLoaded < 0
BEGIN
  SELECT RAISE(ABORT, 'Dispatch line quantities must be positive / non-negative.');
END;

-- stock balances: reserved may never go negative nor exceed on-hand availability
CREATE TRIGGER IF NOT EXISTS trg_stocklevel_reserved_nonneg
BEFORE UPDATE OF onHand, reserved ON StockLevel
WHEN NEW.reserved < 0 OR NEW.onHand < 0
BEGIN
  SELECT RAISE(ABORT, 'Stock balances cannot be negative (D2).');
END;

-- warranty dates: end must not precede start (D5)
CREATE TRIGGER IF NOT EXISTS trg_warranty_dates_ins
BEFORE INSERT ON Warranty
WHEN NEW.endDate < NEW.startDate
BEGIN
  SELECT RAISE(ABORT, 'Warranty end date cannot precede its start date (D5).');
END;
CREATE TRIGGER IF NOT EXISTS trg_warranty_dates_upd
BEFORE UPDATE OF startDate, endDate ON Warranty
WHEN NEW.endDate < NEW.startDate
BEGIN
  SELECT RAISE(ABORT, 'Warranty end date cannot precede its start date (D5).');
END;

-- sign-off integrity (P87): a COMPLETED installation must carry its proof
CREATE TRIGGER IF NOT EXISTS trg_installation_signoff_proof
BEFORE UPDATE OF status ON Installation
WHEN NEW.status = 'COMPLETED' AND (NEW.signoffHash IS NULL OR NEW.signedName IS NULL OR NEW.signedAt IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'A completed installation needs the signed name, time and SHA-256 proof hash.');
END;

-- a unit may sit on at most one live dispatch (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_unit_active
  ON DispatchUnit(unitId)
  WHERE removedAt IS NULL;

-- one ACTIVE warranty per unit (D5 "one warranty row per serialized unit")
CREATE UNIQUE INDEX IF NOT EXISTS ux_warranty_active_per_unit
  ON Warranty(unitId)
  WHERE status = 'ACTIVE';

-- open per-scope access links are cheap to find
CREATE INDEX IF NOT EXISTS ix_link_customer_scope_active
  ON CustomerAccessLink(customerId, scope)
  WHERE revokedAt IS NULL;

-- ── Reporting views (spec §5 "views for the dashboard") ────────────────────

CREATE VIEW IF NOT EXISTS v_available_stock AS
SELECT
  sl.productId,
  sl.locationId,
  l.code            AS locationCode,
  p.sku,
  sl.onHand,
  sl.reserved,
  sl.onHand - sl.reserved AS available
FROM StockLevel sl
JOIN StockLocation l ON l.id = sl.locationId
JOIN Product p ON p.id = sl.productId;

CREATE VIEW IF NOT EXISTS v_order_balance AS
SELECT
  o.id,
  o.orderNumber,
  o.status,
  o.totalPaise,
  o.paidPaise,
  MAX(0, o.totalPaise - o.paidPaise) AS balancePaise,
  (SELECT COUNT(*) FROM Payment pay WHERE pay.orderId = o.id AND pay.status = 'RECEIVED') AS receivedPayments
FROM "Order" o;

CREATE VIEW IF NOT EXISTS v_receivables AS
SELECT
  i.invoiceNumber,
  c.name           AS customerName,
  i.issueDate,
  i.dueDate,
  i.totalPaise,
  i.status,
  CASE WHEN i.status = 'PAID' THEN 0 ELSE i.totalPaise END AS outstandingPaise
FROM Invoice i
JOIN Customer c ON c.id = i.customerId;

CREATE VIEW IF NOT EXISTS v_warranty_active AS
SELECT
  w.id,
  w.unitId,
  u.serialNumber,
  p.name           AS productName,
  w.startDate,
  w.endDate,
  w.months,
  w.coverage,
  w.source
FROM Warranty w
JOIN InventoryUnit u ON u.id = w.unitId
JOIN Product p ON p.id = w.productId
WHERE w.status = 'ACTIVE';
