/**
 * Migrates all data from SQLite (db/custom.db) to PostgreSQL.
 * Auto-detects Boolean and DateTime columns from the Prisma DMMF metadata.
 * Run: node scripts/migrate-sqlite-to-pg.mjs
 */
import Database from 'better-sqlite3';
import { PrismaClient, Prisma } from '@prisma/client';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db', 'custom.db');

const sqlite = new Database(dbPath, { readonly: true });
const prisma = new PrismaClient();

// ── Build column type map from Prisma DMMF ──────────────────────────────────
const BOOL_FIELDS = new Map();   // modelName → Set<fieldName>
const DATE_FIELDS = new Map();   // modelName → Set<fieldName>

for (const model of Prisma.dmmf.datamodel.models) {
  const bools = new Set();
  const dates = new Set();
  for (const field of model.fields) {
    if (field.type === 'Boolean') bools.add(field.name);
    if (field.type === 'DateTime') dates.add(field.name);
  }
  BOOL_FIELDS.set(model.name, bools);
  DATE_FIELDS.set(model.name, dates);
}

// ── Order matters — respect FK dependencies ──────────────────────────────────
// SQLite uses PascalCase table names (exact Prisma model names)
const TABLES = [
  'User','Session','Technician','TechnicianLeave','Setting','NumberSequence',
  'Customer','CustomerAccessLink',
  'Lead','LeadActivity','LeadDuplicateFlag',
  'SiteSurvey','SiteAssessment',
  'Product','SystemTemplate','TemplateBomLine','FaultCode',
  'Quote','QuoteLine',
  'Order','OrderLine','Payment','Invoice','InvoiceLine',
  'Expense','SubsidyApplication',
  'StockLocation','StockLevel','StockMovement',
  'Supplier','PurchaseOrder','PurchaseOrderLine','PurchaseReceipt','PurchaseReceiptLine',
  'InventoryUnit','StockAllocation',
  'Dispatch','DispatchLine','DispatchUnit',
  'Installation','InstallationCrew','TimeLog',
  'Warranty','ServiceTicket','TicketPart','TicketEvent','MaintenanceAlert',
  'Attachment','MediaBlob',
  'Outbox','AuditLog','ShareLink','IdempotencyKey','CrewSuggestion',
];

// ── Row transformer ───────────────────────────────────────────────────────────
function parseRow(modelName, row) {
  const bools = BOOL_FIELDS.get(modelName) ?? new Set();
  const dates = DATE_FIELDS.get(modelName) ?? new Set();
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (bools.has(k)) {
      out[k] = typeof v === 'boolean' ? v : v === 1 || v === '1';
    } else if (dates.has(k)) {
      if (typeof v === 'number') out[k] = new Date(v);
      else if (typeof v === 'string' && /^\d+$/.test(v)) out[k] = new Date(parseInt(v));
      else out[k] = v; // already a string date — pass through
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Composite PK where clauses ────────────────────────────────────────────────
function buildWhere(modelName, data) {
  if (modelName === 'NumberSequence') return { name_year: { name: data.name, year: data.year } };
  if (modelName === 'InstallationCrew') return { installationId_technicianId: { installationId: data.installationId, technicianId: data.technicianId } };
  if (modelName === 'IdempotencyKey') return { scope_key: { scope: data.scope, key: data.key } };
  return { id: data.id };
}

// ── Migrate one table ─────────────────────────────────────────────────────────
async function migrateTable(modelName) {
  const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  const model = prisma[modelKey];
  if (!model) {
    console.warn(`  ⚠️  No Prisma model: ${modelName}`);
    return 0;
  }

  let rows;
  try {
    rows = sqlite.prepare(`SELECT * FROM "${modelName}"`).all();
  } catch (e) {
    console.warn(`  ⚠️  SQLite table "${modelName}" not found`);
    return 0;
  }

  if (!rows.length) {
    console.log(`  · ${modelName}: 0 rows`);
    return 0;
  }

  const parsed = rows.map(r => parseRow(modelName, r));

  // Try bulk createMany first
  try {
    const result = await model.createMany({ data: parsed, skipDuplicates: true });
    console.log(`  ✓ ${modelName}: ${result.count}/${rows.length} rows (bulk)`);
    return result.count;
  } catch (_) {}

  // Row-by-row upsert fallback
  let count = 0, errMsg = '';
  for (const data of parsed) {
    try {
      await model.upsert({ where: buildWhere(modelName, data), create: data, update: data });
      count++;
    } catch (e) {
      errMsg = e.message.split('\n').find(l =>
        l.includes('Argument') || l.includes('Foreign') || l.includes('violates') || l.includes('Unknown')
      ) || e.message.split('\n')[0];
    }
  }

  if (count < rows.length) {
    console.log(`  ✓ ${modelName}: ${count}/${rows.length} rows${count === 0 ? ` ← ${errMsg}` : ''}`);
  } else {
    console.log(`  ✓ ${modelName}: ${count}/${rows.length} rows`);
  }
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting SQLite → PostgreSQL migration');
  console.log(`📂 Source: ${dbPath}`);
  console.log(`📡 Target: PostgreSQL solaros\n`);

  let total = 0;
  for (const modelName of TABLES) {
    try {
      total += await migrateTable(modelName);
    } catch (e) {
      console.error(`  ❌ ${modelName}: ${e.message.split('\n')[0]}`);
    }
  }

  // Verify counts
  console.log('\n── Verification ─────────────────────────────────────────');
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.lead.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.installation.count(),
  ]);
  console.log(`Users: ${counts[0]} | Customers: ${counts[1]} | Leads: ${counts[2]} | Orders: ${counts[3]} | Products: ${counts[4]} | Installations: ${counts[5]}`);
  console.log(`\n✅ Done — ${total} total rows copied to PostgreSQL`);

  await prisma.$disconnect();
  sqlite.close();
}

main().catch(async (e) => {
  console.error('❌ Fatal:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
