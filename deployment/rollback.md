# SolarOS Deployment - Rollback & Disaster Recovery Guide

This document describes the rollback procedures, previous-version recovery, database schema rollback strategies, and contingency responses.

---

## 1. Rollback Scenarios & Trigger Conditions

Initiate an immediate rollback if any of the following occur within 15 minutes of deployment:
- HTTP 500 error rate exceeds 1% of total traffic.
- Critical paths fail:
  - Lead submission (`POST /api/v1/public/enquiries`)
  - Quotation generation (`POST /api/v1/quotes`)
  - Warehouse dispatch loading scan (`POST /api/v1/dispatch/[id]/scan`)
  - Field technician installation sign-off
- Database connection pool exhaustion (`Can't reach database server`).

---

## 2. Docker Rollback Procedure

### Step 1: Revert Code to Prior Stable Tag
```bash
cd /opt/solaros
git checkout <PREVIOUS_STABLE_COMMIT_OR_TAG>
```

### Step 2: Rebuild & Restart App Container
```bash
docker compose -f docker-compose.prod.yml up -d --build --no-deps app
```

### Step 3: Verify Restoration
```bash
docker compose -f docker-compose.prod.yml ps
curl -I http://localhost:3000/
```

---

## 3. PM2 Rollback Procedure

For bare-metal / VM host deployments:

```bash
cd /opt/solaros
git checkout <PREVIOUS_STABLE_COMMIT_OR_TAG>
npm ci
npx prisma generate
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

---

## 4. Database Migration Rollback Considerations

- **Forward-Compatible Migrations:** SolarOS follows non-destructive schema migrations. Adding columns, indexes, and tables does not break previous application versions.
- **Breaking Schema Changes:** If a migration altered or dropped a constraint:
  1. Inspect the migration history:
     ```bash
     npx prisma migrate status
     ```
  2. If a manual down-migration is required, execute the down SQL script located in `prisma/migrations/<migration_name>/down.sql`.
  3. Never run `prisma migrate reset` on a production database, as this drops all tenant data.
  4. Restore from the pre-release database snapshot if data corruption occurred:
     ```bash
     pg_restore -U postgres -d solaros pre_release_snapshot.dump
     ```

---

## 5. Contingency & Incident Communication

- In case of persistent failure, enable maintenance mode in Nginx:
  ```nginx
  location / {
      return 503 "SolarOS is undergoing scheduled maintenance. Please check back in a few minutes.";
  }
  ```
- Notify engineering leads and operations staff via designated channels.

