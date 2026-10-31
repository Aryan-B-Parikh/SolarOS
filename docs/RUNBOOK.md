# SunPower Solar Installation Management System (SolarOS) — Operational Runbook

**Version**: 1.1.0  
**Target Environment**: AWS `ap-south-1` (Mumbai) / Vercel Edge / Cloudflare R2 / Postgres 16  
**Audience**: DevOps, Site Reliability Engineers, Lead Architects

---

## 1. System Architecture Overview

SolarOS operates as a Next.js (App Router) full-stack application using PostgreSQL for transactional data, Cloudflare R2 / AWS S3 for binary attachments, and asynchronous queue workers for messaging.

```
[ Customer Portal / PWA ]       [ Web Browser (Staff) ]
          │                                 │
          └─────────────┬───────────────────┘
                        ▼
                [ Next.js API Routes ]
                (JWT / Session Auth)
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
[ PostgreSQL 16 ]  [ MinIO / R2 ]  [ Asynchronous Outbox Worker ]
(53 Tables / Views) (Photos & PDF)    (SMS / Email Deliveries)
```

---

## 2. Routine Operations & Maintenance

### 2.1 Daily Scheduled Jobs (Cron)

SolarOS relies on two automated cron triggers scheduled via serverless cron (e.g. AWS EventBridge / Vercel Cron):

| Trigger Time | Endpoint | Description |
|---|---|---|
| `* * * * *` (Every min) | `POST /api/v1/cron/outbox` | Drains pending SMS / email notifications with exponential backoff (ADR D6). |
| `0 2 * * *` (02:00 IST daily) | `POST /api/v1/cron/maintenance` | Evaluates 7 predictive maintenance rules, scores active installations, and generates 30-day warranty reminders. |

**Manual Cron Invocation via cURL:**
```bash
curl -X POST https://api.sunpowerops.in/api/v1/cron/maintenance \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 2.2 Database Migrations & Seeding

Migrations are strictly managed with Prisma and versioned SQL files in `prisma/migrations/`:
```bash
# Apply pending migrations to database
npx prisma migrate deploy

# Seed baseline reference catalogue, test credentials, and initial users
npx prisma db seed
```

---

## 3. Incident Management & Troubleshooting

### 3.1 Common Error Scenarios

#### Error 409: `INSUFFICIENT_STOCK`
- **Cause**: An order confirmation or picking attempt requested units exceeding `on_hand - reserved`.
- **Resolution**: Inspect `v_stock_available` in the database. Initiate a Purchase Order receipt under `/purchasing` to replenish stock.

#### Error 403: `FORBIDDEN` / `UNAUTHENTICATED`
- **Cause**: User role does not possess the requisite permission in the RBAC matrix (TRD 2.6).
- **Resolution**: Check the user's role in the `users` table. Verify role matrix permissions in `src/lib/rbac.ts`.

#### Error 410: `LINK_EXPIRED`
- **Cause**: Customer portal or quote link accessed after the token validity window.
- **Resolution**: Staff can re-issue a fresh link from the customer service desk (`/service/[id]`) or lead board.

#### Error 423: `LINK_LOCKED`
- **Cause**: Five incorrect phone verification challenge attempts within 15 minutes.
- **Resolution**: Link automatically unlocks 15 minutes after `locked_until`. Staff can manually clear `locked_until` in the database if identity is verified out-of-band.

---

## 4. Disaster Recovery & Backups

1. **RPO (Recovery Point Objective)**: 5 minutes (via PostgreSQL continuous WAL archiving).
2. **RTO (Recovery Time Objective)**: 15 minutes.
3. **Database Restore**:
   ```bash
   pg_restore -h <db-host> -U solaros_user -d solaros --clean <backup_file.dump>
   ```

