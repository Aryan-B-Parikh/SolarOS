-- ==============================================================================
-- SunPower Ops: Core Business Constraints, Triggers, Views & Security Rules
-- Spec: Sections 5.3, 5.4, 5.5
-- ==============================================================================

-- 1. Inventory & Ledger CHECK Constraints
ALTER TABLE stock_levels
  ADD CONSTRAINT chk_stock_levels_on_hand_positive CHECK (on_hand >= 0),
  ADD CONSTRAINT chk_stock_levels_reserved_valid CHECK (reserved >= 0 AND reserved <= on_hand);

ALTER TABLE stock_movements
  ADD CONSTRAINT chk_stock_movements_qty_positive CHECK (qty > 0),
  ADD CONSTRAINT chk_stock_movements_location_not_null CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL),
  ADD CONSTRAINT chk_stock_movements_unit_qty_one CHECK (unit_id IS NULL OR qty = 1),
  ADD CONSTRAINT chk_stock_movements_adjust_reason CHECK (type NOT IN ('ADJUST_IN','ADJUST_OUT') OR reason IS NOT NULL);

ALTER TABLE inventory_units
  ADD CONSTRAINT chk_inventory_units_delivered_has_customer CHECK (
    status NOT IN ('DELIVERED','INSTALLED') OR (customer_id IS NOT NULL AND delivered_on IS NOT NULL)
  );

ALTER TABLE stock_allocations
  ADD CONSTRAINT chk_stock_allocations_qty_positive CHECK (qty > 0);

-- Partial Unique Index: Exactly one active equipment warranty per physical unit (D5)
CREATE UNIQUE INDEX IF NOT EXISTS warranties_one_active_per_unit
  ON warranties (unit_id) WHERE status = 'ACTIVE';

-- Warranties CHECK Constraints
ALTER TABLE warranties
  ADD CONSTRAINT chk_warranties_dates_valid CHECK (end_date >= start_date),
  ADD CONSTRAINT chk_warranties_equipment_has_unit CHECK ((coverage = 'EQUIPMENT') = (unit_id IS NOT NULL)),
  ADD CONSTRAINT chk_warranties_void_needs_reason CHECK (status <> 'VOID' OR void_reason IS NOT NULL);

-- Service Tickets: Cannot close without customer confirmation (C9)
ALTER TABLE service_tickets
  ADD CONSTRAINT chk_service_tickets_closed_needs_confirmation CHECK (status <> 'CLOSED' OR customer_confirmed_at IS NOT NULL),
  ADD CONSTRAINT chk_service_tickets_in_warranty_has_id CHECK (warranty_verdict <> 'IN_WARRANTY' OR warranty_id IS NOT NULL);

-- Finance & Order CHECKs
ALTER TABLE order_lines
  ADD CONSTRAINT chk_order_lines_reserved_lte_qty CHECK (qty_reserved <= qty),
  ADD CONSTRAINT chk_order_lines_dispatched_lte_qty CHECK (qty_dispatched <= qty);

ALTER TABLE payments
  ADD CONSTRAINT chk_payments_amount_positive CHECK (amount_paise > 0);

-- Partial unique index on Quotes: only one ACCEPTED quote per lead
CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_accepted_per_lead
  ON quotes (lead_id) WHERE status = 'ACCEPTED';

-- 2. Dispatch Guard Trigger: A dispatch cannot go IN_TRANSIT with unloaded lines (FR-5.5 / Section 5.4)
CREATE OR REPLACE FUNCTION dispatch_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'IN_TRANSIT' AND OLD.status <> 'IN_TRANSIT'
     AND EXISTS (
       SELECT 1 FROM dispatch_lines
       WHERE dispatch_id = NEW.id AND qty_loaded < qty_required
     ) THEN
    RAISE EXCEPTION 'DISPATCH_INCOMPLETE: Cannot depart with unfulfilled pick lines'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dispatch_guard_trg ON dispatches;
CREATE TRIGGER dispatch_guard_trg
  BEFORE UPDATE OF status ON dispatches
  FOR EACH ROW EXECUTE FUNCTION dispatch_guard();

-- 3. Database Views (Section 5.5)

-- View 1: Available Stock (On Hand - Reserved)
CREATE OR REPLACE VIEW v_stock_available AS
SELECT
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  p.category,
  sl.location_id,
  loc.code AS location_code,
  loc.name AS location_name,
  sl.on_hand,
  sl.reserved,
  (sl.on_hand - sl.reserved) AS available,
  p.reorder_level,
  CASE WHEN (sl.on_hand - sl.reserved) <= p.reorder_level THEN true ELSE false END AS is_low_stock
FROM stock_levels sl
JOIN products p ON sl.product_id = p.id
JOIN stock_locations loc ON sl.location_id = loc.id;

-- View 2: Unit Warranty Status
CREATE OR REPLACE VIEW v_unit_warranty AS
SELECT
  u.id AS unit_id,
  u.serial_number,
  u.qr_code,
  u.product_id,
  p.name AS product_name,
  u.customer_id,
  c.name AS customer_name,
  c.phone AS customer_phone,
  w.id AS warranty_id,
  w.start_date,
  w.end_date,
  w.status AS warranty_status,
  (w.end_date >= CURRENT_DATE AND w.status = 'ACTIVE') AS covers_today,
  GREATEST(0, (w.end_date - CURRENT_DATE)) AS days_left
FROM inventory_units u
JOIN products p ON u.product_id = p.id
LEFT JOIN customers c ON u.customer_id = c.id
LEFT JOIN warranties w ON u.id = w.unit_id AND w.status = 'ACTIVE';

-- View 3: Project Profitability (Section 5.5 DDL)
CREATE OR REPLACE VIEW v_project_profitability AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.customer_id,
  o.status,
  (o.subtotal_paise - o.discount_paise) AS net_revenue_paise,
  COALESCE(m.cost, 0) AS materials_paise,
  COALESCE(l.cost, 0) AS labour_paise,
  COALESCE(e.cost, 0) AS expenses_paise,
  ((o.subtotal_paise - o.discount_paise)
    - COALESCE(m.cost, 0)
    - COALESCE(l.cost, 0)
    - COALESCE(e.cost, 0)) AS install_profit_paise,
  CASE
    WHEN (o.subtotal_paise - o.discount_paise) > 0 THEN
      ROUND(
        (((o.subtotal_paise - o.discount_paise)
          - COALESCE(m.cost, 0)
          - COALESCE(l.cost, 0)
          - COALESCE(e.cost, 0))::numeric
        / (o.subtotal_paise - o.discount_paise)::numeric) * 10000
      )
    ELSE 0
  END AS margin_bp
FROM orders o
LEFT JOIN LATERAL (
  SELECT SUM(
    CASE sm.type WHEN 'DISPATCH' THEN 1 ELSE -1 END
    * sm.qty * sm.unit_cost_paise
  ) AS cost
  FROM stock_movements sm
  JOIN dispatches d ON sm.ref_type = 'dispatch' AND sm.ref_id = d.id
  WHERE d.order_id = o.id AND sm.type IN ('DISPATCH', 'RETURN')
) m ON true
LEFT JOIN LATERAL (
  SELECT SUM(
    (EXTRACT(EPOCH FROM (t.ended_at - t.started_at)) / 3600)::numeric
    * t.hourly_cost_paise
  ) AS cost
  FROM time_logs t
  JOIN installations i ON t.installation_id = i.id
  WHERE i.order_id = o.id
) l ON true
LEFT JOIN LATERAL (
  SELECT SUM(x.amount_paise) AS cost
  FROM expenses x
  WHERE x.order_id = o.id
) e ON true;

-- View 4: Pending Steps
CREATE OR REPLACE VIEW v_pending_steps AS
SELECT
  'LEAD' AS entity_type,
  l.id AS entity_id,
  l.lead_number AS reference_number,
  l.status::text AS stage,
  ROUND(EXTRACT(EPOCH FROM (now() - l.updated_at)) / 86400) AS age_days,
  l.owner_id AS assignee_id
FROM leads l
WHERE l.status NOT IN ('WON', 'LOST', 'DISQUALIFIED')
UNION ALL
SELECT
  'ORDER' AS entity_type,
  o.id AS entity_id,
  o.order_number AS reference_number,
  o.status::text AS stage,
  ROUND(EXTRACT(EPOCH FROM (now() - o.updated_at)) / 86400) AS age_days,
  NULL AS assignee_id
FROM orders o
WHERE o.status NOT IN ('CLOSED', 'CANCELLED')
UNION ALL
SELECT
  'TICKET' AS entity_type,
  t.id AS entity_id,
  t.ticket_number AS reference_number,
  t.status::text AS stage,
  ROUND(EXTRACT(EPOCH FROM (now() - t.created_at)) / 86400) AS age_days,
  t.assigned_to AS assignee_id
FROM service_tickets t
WHERE t.status NOT IN ('RESOLVED', 'CLOSED');

-- View 5: Revenue Trend (Monthly aggregated)
CREATE OR REPLACE VIEW v_revenue_trend AS
SELECT
  to_char(date_trunc('month', p.received_on), 'YYYY-MM') AS month,
  SUM(p.amount_paise) AS collections_paise,
  COUNT(DISTINCT p.order_id) AS orders_count
FROM payments p
WHERE p.status = 'RECORDED' OR p.status = 'VERIFIED'
GROUP BY date_trunc('month', p.received_on)
ORDER BY month DESC;

-- View 6: Customer Timeline
CREATE OR REPLACE VIEW v_customer_timeline AS
SELECT
  c.id AS customer_id,
  c.customer_number,
  c.name AS customer_name,
  COALESCE(o.status::text, l.status::text, 'NEW') AS current_stage,
  CASE
    WHEN o.status = 'INSTALLED' THEN 'Installation completed! Access your warranty documents and certificate.'
    WHEN o.status = 'DELIVERED' THEN 'Equipment delivered on site. Installation in progress.'
    WHEN o.status = 'DISPATCHED' THEN 'Equipment dispatched to your location.'
    WHEN o.status = 'CONFIRMED' THEN 'Advance payment received. Your installation is scheduled.'
    WHEN o.status = 'PENDING_ADVANCE' THEN 'Quotation accepted. Awaiting advance payment.'
    WHEN l.status = 'QUOTED' THEN 'Your official quotation has been sent. Please review and accept.'
    WHEN l.status = 'SURVEY_APPROVED' THEN 'Site survey approved. Quotation is being prepared.'
    WHEN l.status = 'SURVEY_SCHEDULED' THEN 'Technical site survey scheduled.'
    ELSE 'Enquiry received. Our sales engineer will contact you shortly.'
  END AS next_step_message
FROM customers c
LEFT JOIN leads l ON c.id = l.customer_id
LEFT JOIN orders o ON c.id = o.customer_id;

-- 4. Ledger and History Immutability (REVOKEs)
-- In production, the application database role should not be able to delete ledger history
DO $$
BEGIN
  -- Conditionally revoke from app_user if role exists
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE UPDATE, DELETE ON stock_movements FROM app_user;
    REVOKE DELETE ON warranties FROM app_user;
    REVOKE DELETE ON audit_log FROM app_user;
  END IF;
END
$$;

