# SunPower Solar Installation Management System (SolarOS) — Environment Configuration

This document defines all environment variables required for deploying and operating SolarOS across Local, Staging, and Production environments.

---

## 1. Core Application & Server

| Variable Name | Required | Default / Example | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Node runtime environment (`development`, `test`, `production`). |
| `PORT` | No | `3000` | HTTP listening port for Next.js. |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://sunpowerops.in` | Base public URL used for generating customer access links and callbacks. |
| `CRON_SECRET` | Yes | `crypto.randomBytes(32).toString('hex')` | Bearer token authenticating internal cron triggers (`/cron/*`). |

---

## 2. Database (PostgreSQL 16)

| Variable Name | Required | Default / Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://solaros_user:solaros_password@localhost:5433/solaros?schema=public` | Primary pooled PostgreSQL connection URI. |
| `DIRECT_URL` | No | `postgresql://solaros_user:solaros_password@localhost:5433/solaros?schema=public` | Direct non-pooled connection URI for running Prisma migrations. |

---

## 3. Security & Cryptography

| Variable Name | Required | Example | Purpose |
|---|---|---|---|
| `NEXTAUTH_SECRET` | Yes | `64-char random hex string` | Session cookie encryption secret (Argon2id auth). |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` | Canonical NextAuth origin. |
| `ACCESS_LINK_SECRET` | Yes | `32-char random string` | Secret used for HMAC-SHA256 signing of customer tokens and director share links. |

---

## 4. Object Storage (S3 / MinIO / Cloudflare R2)

| Variable Name | Required | Example | Purpose |
|---|---|---|---|
| `S3_ENDPOINT` | Yes | `http://localhost:9000` | Custom S3 endpoint (MinIO or R2 endpoint URL). |
| `S3_REGION` | Yes | `ap-south-1` | S3 bucket region. |
| `S3_BUCKET` | Yes | `solaros-attachments` | Target bucket name. |
| `S3_ACCESS_KEY` | Yes | `minioadmin` | AWS / R2 Access Key ID. |
| `S3_SECRET_KEY` | Yes | `minioadmin` | AWS / R2 Secret Access Key. |

---

## 5. Communications (Email & SMS)

| Variable Name | Required | Default / Example | Purpose |
|---|---|---|---|
| `SMTP_HOST` | Yes | `localhost` (Mailpit: 1025) | Outgoing SMTP server. |
| `SMTP_PORT` | Yes | `1025` | Outgoing SMTP port. |
| `SMTP_USER` | No | `""` | SMTP authentication user. |
| `SMTP_PASS` | No | `""` | SMTP authentication password. |
| `SMS_PROVIDER_KEY` | No | `mock` | SMS gateway API key. |

