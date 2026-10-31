# SolarOS Deployment - Environments Guide

This document describes the environment topology, configuration parameters, and secret requirements for SolarOS (SunPower Ops).

---

## 1. Environment Tiers

| Tier | Host / Platform | Database | Storage | Gateways | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Development** | Local machine (`localhost:3000`) | PostgreSQL 18 (Local `5432` or Docker `5433`) | Local filesystem / MinIO | Mock / Sandbox | Local coding & unit testing |
| **Staging** | Docker Container / Vercel Preview | Managed PostgreSQL (Supabase / RDS) | Cloudflare R2 / S3 | Sandbox (Razorpay Test, Mock SMS) | Pre-release QA & integration validation |
| **Production** | Linux VM (Docker Compose / PM2 behind Nginx) | High-availability PostgreSQL 16+ | Cloudflare R2 / AWS S3 | Live (Razorpay, MSG91, Twilio, Gemini) | Live field operations & customer portal |

---

## 2. Environment Variables Specification

### Core Application & Database
- `DATABASE_URL`: Connection string with pooled schema (`postgresql://USER:PASS@HOST:PORT/DB?schema=public`). **[Verified]**
- `NODE_ENV`: `development` or `production`. **[Verified]**
- `PORT`: HTTP port (defaults to `3000`). **[Verified]**
- `APP_BASE_URL`: Public root domain for magic links, webhooks, and QR URLs (e.g. `https://ops.sunpower.in`). **[Verified]**
- `AUTH_SECRET`: 256-bit secret used by Auth.js for session cookie signatures. **[Verified]**
- `CRON_SECRET`: Bearer token securing `/api/v1/cron/*` endpoints against unauthenticated invocation. **[Verified]**

### Object Storage (Attachments, Photos, Signatures)
- `S3_ENDPOINT`: S3-compatible API endpoint (MinIO locally or Cloudflare R2 endpoint). **[Verified]**
- `S3_BUCKET`: Media bucket name (e.g. `solaros-media`). **[Verified]**
- `S3_ACCESS_KEY_ID`: S3 credentials. **[Verified]**
- `S3_SECRET_ACCESS_KEY`: S3 credentials. **[Verified]**
- `S3_REGION`: Region string (default `auto` or `ap-south-1`). **[Verified]**

### Payment Gateways (Razorpay & Cashfree)
- `RAZORPAY_KEY_ID`: Public Razorpay key ID (`rzp_live_...` or `rzp_test_...`). **[Verified]**
- `RAZORPAY_KEY_SECRET`: Private secret for server-side order generation. **[Verified]**
- `RAZORPAY_WEBHOOK_SECRET`: HMAC SHA256 secret used to verify webhook callbacks. **[Verified]**
- `CASHFREE_APP_ID`: Cashfree application ID (optional alternative). **[Verified]**
- `CASHFREE_SECRET_KEY`: Cashfree secret key (optional alternative). **[Verified]**

### Communication Gateways (Transactional Outbox)
- `MSG91_AUTH_KEY`: Authentication key for MSG91 Flow SMS API. **[Verified]**
- `MSG91_TEMPLATE_ID`: Template identifier registered with DLT. **[Verified]**
- `TWILIO_ACCOUNT_SID`: Twilio account identifier for WhatsApp notifications. **[Verified]**
- `TWILIO_AUTH_TOKEN`: Twilio auth token. **[Verified]**
- `TWILIO_WHATSAPP_NUMBER`: Authorized WhatsApp sender number (e.g. `+14155238886`). **[Verified]**
- `RESEND_API_KEY`: API key for transactional email delivery via Resend. **[Verified]**
- `EMAIL_FROM`: Verified sender email address (e.g. `SunPower Ops <notifications@sunpower.in>`). **[Verified]**

### AI Multimodal Vision
- `GEMINI_API_KEY`: Google AI Studio API key for Gemini 1.5 Flash multimodal vision and site assessment summaries. **[Verified]**

---

## 3. Secret Management & Security Policies

- **Never commit `.env` or `.env.local` to version control.** `.gitignore` strictly ignores all local environment files.
- **Production secrets injection:** In Docker deployments, secrets are passed via Docker environment files or external secret vaults (AWS Secrets Manager / HashiCorp Vault).
- **Access Link tokens:** Stored as deterministic SHA-256 hashes (`token_hash`) in the database; raw tokens exist only in URL fragments and are never persisted in plaintext.

