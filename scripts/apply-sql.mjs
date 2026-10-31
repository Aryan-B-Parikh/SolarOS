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

function splitSql(sql) {
  const cleanSql = sql.replace(/--.*$/gm, '');
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i];
    const nextChar = cleanSql[i + 1];

    if (char === '$' && nextChar === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++;
      continue;
    }

    if (char === ';' && !inDollarQuote) {
      if (current.trim().length > 0) {
        statements.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

const statements = splitSql(sql);

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
