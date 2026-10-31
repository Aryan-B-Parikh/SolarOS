-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL');

-- CreateEnum
CREATE TYPE "LinkScope" AS ENUM ('PORTAL', 'QUOTE', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEB', 'WHATSAPP', 'PHONE', 'WALK_IN', 'REFERRAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'SURVEY_APPROVED', 'QUOTED', 'WON', 'LOST', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('ON_GRID', 'OFF_GRID', 'HYBRID');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'NOTE', 'STATUS_CHANGE', 'SURVEY_BOOKED', 'QUOTE_SENT');

-- CreateEnum
CREATE TYPE "DuplicateReason" AS ENUM ('ADDRESS');

-- CreateEnum
CREATE TYPE "DuplicateFlagStatus" AS ENUM ('OPEN', 'LINKED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoofType" AS ENUM ('RCC_FLAT', 'TIN_SHED', 'TILED', 'OTHER');

-- CreateEnum
CREATE TYPE "ShadingLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SOLAR_PANEL', 'INVERTER', 'BATTERY', 'CHARGE_CONTROLLER', 'STRUCTURE', 'CABLE', 'ACDB', 'DCDB', 'EARTHING', 'LIGHTNING_ARRESTER', 'CONNECTOR', 'ACCESSORY', 'SERVICE');

-- CreateEnum
CREATE TYPE "WarrantyStartBasis" AS ENUM ('DELIVERY', 'INSTALLATION_SIGNOFF');

-- CreateEnum
CREATE TYPE "BomRule" AS ENUM ('FIXED', 'PANEL_COUNT', 'PER_PANEL', 'PER_KW', 'PER_CABLE_METER', 'MANUAL');

-- CreateEnum
CREATE TYPE "FaultPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_ADVANCE', 'CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'NEFT', 'CASH', 'CHEQUE', 'LOAN', 'CARD', 'NET_BANKING');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'PART', 'FINAL', 'SERVICE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('RECORDED', 'VERIFIED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SALES', 'SERVICE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MATERIALS', 'LABOUR', 'TRANSPORT', 'PERMITS', 'MISC');

-- CreateEnum
CREATE TYPE "SubsidyStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'UNDER_INSPECTION', 'APPROVED', 'DISBURSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('WAREHOUSE', 'VEHICLE', 'CUSTOMER_SITES', 'RMA', 'SCRAP');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'DISPATCH', 'DELIVERY', 'RETURN', 'ADJUST_IN', 'ADJUST_OUT', 'RMA_OUT', 'SCRAP');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('IN_STOCK', 'PICKED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RMA', 'REPLACED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PICKING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('QR', 'BARCODE', 'MANUAL');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'AWAITING_SIGNOFF', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "WarrantyCoverage" AS ENUM ('EQUIPMENT', 'WORKMANSHIP');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'VOID', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "WarrantySource" AS ENUM ('DELIVERY', 'REPLACEMENT', 'SIGN_OFF');

-- CreateEnum
CREATE TYPE "TicketChannel" AS ENUM ('PHONE', 'WHATSAPP', 'WEB', 'VISIT', 'MAINTENANCE_ALERT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WarrantyVerdict" AS ENUM ('IN_WARRANTY', 'OUT_OF_WARRANTY', 'EXCLUDED', 'UNKNOWN_UNIT');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('WARRANTY', 'CHARGEABLE');

-- CreateEnum
CREATE TYPE "MaintenanceRule" AS ENUM ('CLEANING_DUE', 'PRE_MONSOON', 'REPEAT_FAULT', 'MODEL_RISK', 'BATTERY_AGE', 'WARRANTY_EXPIRING_SALES', 'WARRANTY_REMINDER_CUSTOMER');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('LEAD', 'SURVEY', 'ORDER', 'INSTALLATION', 'TICKET', 'EXPENSE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('SURVEY', 'BEFORE', 'AFTER', 'ARRAY', 'INVERTER', 'EARTHING', 'SIGNATURE', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "OutboxChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "user_id" UUID NOT NULL,
    "skills" TEXT[],
    "base_lat" DECIMAL(10,7),
    "base_lng" DECIMAL(10,7),
    "hourly_cost_paise" BIGINT NOT NULL DEFAULT 0,
    "max_jobs_per_day" INTEGER NOT NULL DEFAULT 2,
    "is_crew_lead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "technician_leave" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("name","year")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "customer_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Ahmedabad',
    "state" TEXT NOT NULL DEFAULT 'Gujarat',
    "pincode" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "type" "CustomerType" NOT NULL DEFAULT 'RESIDENTIAL',
    "consumer_no" TEXT,
    "discom" TEXT,
    "consent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_access_links" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "scope" "LinkScope" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "lead_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "source" "LeadSource" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "owner_id" UUID,
    "requested_capacity_kw" DECIMAL(4,2),
    "system_type_pref" "SystemType" DEFAULT 'ON_GRID',
    "wants_subsidy" BOOLEAN NOT NULL DEFAULT false,
    "monthly_bill_paise" BIGINT,
    "monthly_units" DECIMAL(10,2),
    "tariff_paise" BIGINT DEFAULT 700,
    "roof_area_sqm" DECIMAL(10,2),
    "grid_ok" BOOLEAN,
    "sanctioned_load_kw" DECIMAL(5,2),
    "phase" TEXT,
    "lost_reason" TEXT,
    "first_contacted_at" TIMESTAMPTZ,
    "sla_due_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_duplicate_flags" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "matched_customer_id" UUID NOT NULL,
    "matched_lead_id" UUID,
    "reason" "DuplicateReason" NOT NULL DEFAULT 'ADDRESS',
    "score" DECIMAL(4,3) NOT NULL,
    "status" "DuplicateFlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_duplicate_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_surveys" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "surveyor_id" UUID,
    "status" "SurveyStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "roof_type" "RoofType" NOT NULL DEFAULT 'RCC_FLAT',
    "azimuth_deg" INTEGER NOT NULL DEFAULT 180,
    "tilt_deg" INTEGER NOT NULL DEFAULT 20,
    "usable_area_sqm" DECIMAL(8,2) NOT NULL,
    "shading" "ShadingLevel" NOT NULL DEFAULT 'NONE',
    "cable_distance_m" DECIMAL(6,2) NOT NULL DEFAULT 25,
    "structure_height_m" DECIMAL(5,2),
    "notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "site_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_assessments" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "survey_id" UUID,
    "inputs" JSONB NOT NULL,
    "recommended_kw" DECIMAL(4,2) NOT NULL,
    "recommended_type" "SystemType" NOT NULL DEFAULT 'ON_GRID',
    "annual_generation_kwh" DECIMAL(10,2) NOT NULL,
    "annual_savings_paise" BIGINT NOT NULL,
    "payback_years" DECIMAL(4,1) NOT NULL,
    "flags" TEXT[],
    "ai_summary" TEXT,
    "ai_risks" JSONB,
    "ai_model" TEXT,
    "prompt_version" TEXT,
    "photo_findings" JSONB,
    "photo_model" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "site_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'NOS',
    "is_serialized" BOOLEAN NOT NULL DEFAULT false,
    "warranty_months" INTEGER NOT NULL DEFAULT 0,
    "warranty_start_basis" "WarrantyStartBasis" NOT NULL DEFAULT 'DELIVERY',
    "rated_power_w" INTEGER,
    "specs" JSONB,
    "hsn_code" TEXT,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 1800,
    "std_cost_paise" BIGINT NOT NULL DEFAULT 0,
    "sale_price_paise" BIGINT NOT NULL DEFAULT 0,
    "reorder_level" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "monitoring_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system_type" "SystemType" NOT NULL DEFAULT 'ON_GRID',
    "capacity_kw" DECIMAL(4,2) NOT NULL,
    "panel_product_id" UUID NOT NULL,
    "default_cable_distance_m" DECIMAL(6,2) NOT NULL DEFAULT 25,
    "labour_allowance_paise" BIGINT NOT NULL DEFAULT 0,
    "price_override_paise" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_bom_lines" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "rule" "BomRule" NOT NULL,
    "value" DECIMAL(10,3) NOT NULL,
    "allowance" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fault_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "product_model" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "default_priority" "FaultPriority" NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "fault_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "quote_number" TEXT NOT NULL,
    "lead_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "template_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "capacity_kw" DECIMAL(4,2) NOT NULL,
    "system_type" "SystemType" NOT NULL DEFAULT 'ON_GRID',
    "cable_distance_m" DECIMAL(6,2) NOT NULL DEFAULT 25,
    "subtotal_paise" BIGINT NOT NULL,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "tax_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "subsidy_estimate_paise" BIGINT NOT NULL DEFAULT 0,
    "estimated_margin_bp" INTEGER NOT NULL DEFAULT 0,
    "margin_warning" BOOLEAN NOT NULL DEFAULT false,
    "discount_approved_by" UUID,
    "valid_until" DATE NOT NULL,
    "public_token_hash" TEXT,
    "sent_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "accepted_name" TEXT,
    "rejected_at" TIMESTAMPTZ,
    "reject_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_price_paise" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 1800,
    "line_total_paise" BIGINT NOT NULL,
    "rule" "BomRule" NOT NULL DEFAULT 'FIXED',
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "manual_reason" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "quote_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_ADVANCE',
    "capacity_kw" DECIMAL(4,2) NOT NULL,
    "system_type" "SystemType" NOT NULL DEFAULT 'ON_GRID',
    "site_snapshot" JSONB NOT NULL,
    "subtotal_paise" BIGINT NOT NULL,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "tax_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "advance_required_paise" BIGINT NOT NULL,
    "paid_paise" BIGINT NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ,
    "override_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_price_paise" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 1800,
    "qty_reserved" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qty_dispatched" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "invoice_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "reference" TEXT,
    "received_on" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "idempotency_key" TEXT NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "ticket_id" UUID,
    "type" "InvoiceType" NOT NULL DEFAULT 'SALES',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal_paise" BIGINT NOT NULL,
    "tax_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "pdf_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "product_id" UUID,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_price_paise" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 1800,
    "line_total_paise" BIGINT NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "incurred_on" DATE NOT NULL,
    "order_id" UUID,
    "ticket_id" UUID,
    "description" TEXT NOT NULL,
    "receipt_attachment_id" UUID,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subsidy_applications" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "SubsidyStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "application_ref" TEXT,
    "expected_paise" BIGINT NOT NULL DEFAULT 0,
    "received_paise" BIGINT NOT NULL DEFAULT 0,
    "submitted_on" DATE,
    "disbursed_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subsidy_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "avg_cost_paise" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("product_id","location_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID,
    "qty" DECIMAL(12,3) NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "type" "MovementType" NOT NULL,
    "unit_cost_paise" BIGINT NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "ordered_on" DATE NOT NULL,
    "expected_on" DATE,
    "total_paise" BIGINT NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty_ordered" DECIMAL(12,3) NOT NULL,
    "qty_received" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_cost_paise" BIGINT NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "supplier_name" TEXT,
    "supplier_id" UUID,
    "po_id" UUID,
    "supplier_invoice_ref" TEXT,
    "received_on" DATE NOT NULL,
    "location_id" UUID NOT NULL,
    "total_paise" BIGINT NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "po_line_id" UUID,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_cost_paise" BIGINT NOT NULL,

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_units" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "qr_code" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "location_id" UUID NOT NULL,
    "receipt_line_id" UUID,
    "unit_cost_paise" BIGINT NOT NULL,
    "order_id" UUID,
    "customer_id" UUID,
    "installation_id" UUID,
    "delivered_on" DATE,
    "replaced_by_unit_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_allocations" (
    "id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "stock_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL,
    "dispatch_number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PICKING',
    "from_location_id" UUID NOT NULL,
    "vehicle_location_id" UUID,
    "scheduled_on" DATE NOT NULL,
    "crew_lead_id" UUID,
    "packed_by" UUID,
    "departed_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "delivered_lat" DECIMAL(10,7),
    "delivered_lng" DECIMAL(10,7),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_lines" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty_required" DECIMAL(12,3) NOT NULL,
    "qty_loaded" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_units" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "dispatch_line_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "method" "ScanMethod" NOT NULL DEFAULT 'QR',
    "scanned_by" UUID NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ,

    CONSTRAINT "dispatch_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_on" DATE NOT NULL,
    "slot" TEXT NOT NULL DEFAULT 'MORNING',
    "crew_lead_id" UUID,
    "started_at" TIMESTAMPTZ,
    "start_lat" DECIMAL(10,7),
    "start_lng" DECIMAL(10,7),
    "finished_at" TIMESTAMPTZ,
    "installed_capacity_kw" DECIMAL(4,2),
    "test_reading_w" DECIMAL(10,2),
    "checklist" JSONB,
    "signed_name" TEXT,
    "signed_at" TIMESTAMPTZ,
    "signature_attachment_id" UUID,
    "signoff_hash" TEXT,
    "certificate_key" TEXT,
    "certificate_token_hash" TEXT,
    "hold_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_crew" (
    "installation_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT',

    CONSTRAINT "installation_crew_pkey" PRIMARY KEY ("installation_id","technician_id")
);

-- CreateTable
CREATE TABLE "crew_suggestions" (
    "id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "technician_ids" TEXT[],
    "score" DECIMAL(5,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_logs" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "installation_id" UUID,
    "ticket_id" UUID,
    "survey_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ NOT NULL,
    "hourly_cost_paise" BIGINT NOT NULL,

    CONSTRAINT "time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" UUID NOT NULL,
    "unit_id" UUID,
    "installation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID,
    "coverage" "WarrantyCoverage" NOT NULL DEFAULT 'EQUIPMENT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "months" INTEGER NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "WarrantySource" NOT NULL DEFAULT 'DELIVERY',
    "parent_warranty_id" UUID,
    "void_reason" TEXT,
    "voided_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_tickets" (
    "id" UUID NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "installation_id" UUID,
    "unit_id" UUID,
    "warranty_id" UUID,
    "channel" "TicketChannel" NOT NULL DEFAULT 'PHONE',
    "category" TEXT NOT NULL,
    "fault_code" TEXT,
    "description" TEXT NOT NULL,
    "priority" "FaultPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "warranty_verdict" "WarrantyVerdict" NOT NULL,
    "billing_mode" "BillingMode" NOT NULL DEFAULT 'WARRANTY',
    "assigned_to" UUID,
    "sla_due_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,
    "customer_confirmed_at" TIMESTAMPTZ,
    "confirmation_method" TEXT,
    "closed_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "service_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_parts" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "removed_unit_id" UUID,
    "installed_unit_id" UUID,
    "unit_price_paise" BIGINT NOT NULL DEFAULT 0,
    "chargeable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ticket_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "from_status" "TicketStatus",
    "to_status" "TicketStatus",
    "note" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_alerts" (
    "id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "unit_id" UUID,
    "rule" "MaintenanceRule" NOT NULL,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "due_on" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PENDING',
    "ticket_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "owner_type" "AttachmentOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "taken_at" TIMESTAMPTZ,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "channel" "OutboxChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "provider_message_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL DEFAULT 'USER',
    "actor_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "params" JSONB,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_number_key" ON "customers"("customer_number");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_access_links_token_hash_key" ON "customer_access_links"("token_hash");

-- CreateIndex
CREATE INDEX "customer_access_links_customer_id_idx" ON "customer_access_links"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_lead_number_key" ON "leads"("lead_number");

-- CreateIndex
CREATE INDEX "leads_status_owner_id_idx" ON "leads"("status", "owner_id");

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_duplicate_flags_status_idx" ON "lead_duplicate_flags"("status");

-- CreateIndex
CREATE UNIQUE INDEX "site_surveys_lead_id_key" ON "site_surveys"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_assessments_lead_id_key" ON "site_assessments"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "system_templates_code_key" ON "system_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "template_bom_lines_template_id_product_id_key" ON "template_bom_lines"("template_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "fault_codes_product_model_code_key" ON "fault_codes"("product_model", "code");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_public_token_hash_key" ON "quotes"("public_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_lead_id_version_key" ON "quotes"("lead_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_quote_id_key" ON "orders"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "expenses_incurred_on_idx" ON "expenses"("incurred_on");

-- CreateIndex
CREATE UNIQUE INDEX "subsidy_applications_order_id_key" ON "subsidy_applications"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_code_key" ON "stock_locations"("code");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_receipt_number_key" ON "purchase_receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_qr_code_key" ON "inventory_units"("qr_code");

-- CreateIndex
CREATE INDEX "inventory_units_serial_number_idx" ON "inventory_units"("serial_number");

-- CreateIndex
CREATE INDEX "inventory_units_customer_id_idx" ON "inventory_units"("customer_id");

-- CreateIndex
CREATE INDEX "inventory_units_product_id_status_location_id_idx" ON "inventory_units"("product_id", "status", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_product_id_serial_number_key" ON "inventory_units"("product_id", "serial_number");

-- CreateIndex
CREATE INDEX "stock_allocations_order_line_id_idx" ON "stock_allocations"("order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_dispatch_number_key" ON "dispatches"("dispatch_number");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_units_dispatch_id_unit_id_key" ON "dispatch_units"("dispatch_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "installations_order_id_key" ON "installations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "installations_certificate_token_hash_key" ON "installations"("certificate_token_hash");

-- CreateIndex
CREATE INDEX "warranties_customer_id_idx" ON "warranties"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_tickets_ticket_number_key" ON "service_tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "service_tickets_status_sla_due_at_idx" ON "service_tickets"("status", "sla_due_at");

-- CreateIndex
CREATE INDEX "service_tickets_unit_id_idx" ON "service_tickets"("unit_id");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_alerts_installation_id_rule_due_on_key" ON "maintenance_alerts"("installation_id", "rule", "due_on");

-- CreateIndex
CREATE INDEX "attachments_owner_type_owner_id_idx" ON "attachments"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_idempotency_key_key" ON "outbox"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_status_next_attempt_at_idx" ON "outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_leave" ADD CONSTRAINT "technician_leave_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_access_links" ADD CONSTRAINT "customer_access_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_access_links" ADD CONSTRAINT "customer_access_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_duplicate_flags" ADD CONSTRAINT "lead_duplicate_flags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_duplicate_flags" ADD CONSTRAINT "lead_duplicate_flags_matched_customer_id_fkey" FOREIGN KEY ("matched_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_duplicate_flags" ADD CONSTRAINT "lead_duplicate_flags_matched_lead_id_fkey" FOREIGN KEY ("matched_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_duplicate_flags" ADD CONSTRAINT "lead_duplicate_flags_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_surveyor_id_fkey" FOREIGN KEY ("surveyor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assessments" ADD CONSTRAINT "site_assessments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assessments" ADD CONSTRAINT "site_assessments_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "site_surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_templates" ADD CONSTRAINT "system_templates_panel_product_id_fkey" FOREIGN KEY ("panel_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_bom_lines" ADD CONSTRAINT "template_bom_lines_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "system_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_bom_lines" ADD CONSTRAINT "template_bom_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "system_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_discount_approved_by_fkey" FOREIGN KEY ("discount_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_override_by_fkey" FOREIGN KEY ("override_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "service_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "service_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_attachment_id_fkey" FOREIGN KEY ("receipt_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subsidy_applications" ADD CONSTRAINT "subsidy_applications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "purchase_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_replaced_by_unit_id_fkey" FOREIGN KEY ("replaced_by_unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vehicle_location_id_fkey" FOREIGN KEY ("vehicle_location_id") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_crew_lead_id_fkey" FOREIGN KEY ("crew_lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_units" ADD CONSTRAINT "dispatch_units_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_units" ADD CONSTRAINT "dispatch_units_dispatch_line_id_fkey" FOREIGN KEY ("dispatch_line_id") REFERENCES "dispatch_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_units" ADD CONSTRAINT "dispatch_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_units" ADD CONSTRAINT "dispatch_units_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_crew_lead_id_fkey" FOREIGN KEY ("crew_lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_signature_attachment_id_fkey" FOREIGN KEY ("signature_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_crew" ADD CONSTRAINT "installation_crew_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_crew" ADD CONSTRAINT "installation_crew_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_suggestions" ADD CONSTRAINT "crew_suggestions_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "service_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "site_surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_parent_warranty_id_fkey" FOREIGN KEY ("parent_warranty_id") REFERENCES "warranties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_parts" ADD CONSTRAINT "ticket_parts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "service_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_parts" ADD CONSTRAINT "ticket_parts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_parts" ADD CONSTRAINT "ticket_parts_removed_unit_id_fkey" FOREIGN KEY ("removed_unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_parts" ADD CONSTRAINT "ticket_parts_installed_unit_id_fkey" FOREIGN KEY ("installed_unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "service_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_alerts" ADD CONSTRAINT "maintenance_alerts_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_alerts" ADD CONSTRAINT "maintenance_alerts_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_alerts" ADD CONSTRAINT "maintenance_alerts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "service_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

