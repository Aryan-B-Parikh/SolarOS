/**
 * Applies a raw SQL file (e.g. prisma/migrations/*.sql) to the database
 * using the Prisma client, so CI can run without psql installed.
 *
 * Usage: node scripts/apply-sql.mjs prisma/migrations/0002_constraints.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-sql.mjs <file.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), 'utf8');
const prisma = new PrismaClient();

// Remove line comments (-- ...)
const cleanSql = sql.replace(/--.*$/gm, '');
const statements = cleanSql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

let applied = 0;
for (const stmt of statements) {
  try {
    await prisma.$executeRawUnsafe(stmt);
    applied++;
  } catch (err) {
    const msg = String(err?.message || err);
    // Idempotent re-runs: skip "already exists" errors
    if (/already exists|duplicate object/i.test(msg)) {
      continue;
    }
    console.error(`Failed statement:\n${stmt.slice(0, 300)}\nError: ${msg}`);
    process.exitCode = 1;
    break;
  }
}

console.log(`apply-sql: ${applied} statement(s) applied from ${file}`);
await prisma.$disconnect();
