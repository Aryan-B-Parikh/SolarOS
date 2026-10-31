# SolarOS Deployment - Build Guide

This document details the build process, prerequisites, compilation commands, and artifact outputs for SolarOS.

---

## 1. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **Database Engine**: PostgreSQL 16+ with extensions (`uuid-ossp`, `pg_trgm`)
- **Docker** (Optional, for containerized builds): Docker Engine 24+ and Docker Compose v2+

---

## 2. Dependency Installation

```bash
npm ci
```
*Note: Always use `npm ci` in automated CI/CD pipelines to guarantee reproducible dependency trees from `package-lock.json`.*

---

## 3. Database Client Generation

Before building the TypeScript / Next.js application, Prisma Client must be generated from `prisma/schema.prisma`:

```bash
npx prisma generate
```
Output: Generates TypeScript typings and query engine into `node_modules/@prisma/client`.

---

## 4. Production Build Commands

### Standard Next.js Production Build
```bash
npm run build
```
Output: Generates optimized client and server bundles in `.next/`.

### Standalone Production Build (For Docker)
```bash
STANDALONE=true npm run build
```
Output: Generates a self-contained runtime in `.next/standalone/` that can be run with zero external `node_modules` dependencies using `node server.js`.

---

## 5. Docker Container Image Build

To build the production container image locally:

```bash
docker build -t sunpower-ops:1.1.0 -f Dockerfile .
```

To test the container locally:
```bash
docker run -p 3000:3000 --env-file .env.local sunpower-ops:1.1.0
```

---

## 6. Build Artifacts Summary

| Artifact Path | Contents | Purpose |
| :--- | :--- | :--- |
| `.next/standalone/` | Minimal Node.js server (`server.js`) and bundled dependencies | Lightweight production runtime |
| `.next/static/` | Fingerprinted JavaScript chunks, CSS stylesheets, images | Proxied and cached by Nginx |
| `public/` | Favicon, web manifest, static assets | Served directly by Nginx or Next.js |
| `prisma/` | Schema, seed scripts, SQL migrations | Database migration runner |

