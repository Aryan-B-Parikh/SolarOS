# SolarOS Deployment - Deployment Architecture & Execution Guide

This document specifies the production deployment architecture, step-by-step rollout procedures, health verification checks, and failure recovery.

---

## 1. Production Architecture Overview

```
                        [ Internet / Client Requests ]
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Nginx 1.25 Reverse Proxy    │
                      │  - Port 80 -> 443 Redirect    │
                      │  - SSL / TLS 1.3 Termination  │
                      │  - Gzip & Brotli Compression  │
                      │  - Rate Limiting Zones        │
                      └──────────────┬────────────────┘
                                     │ (HTTP / keepalive)
                                     ▼
                      ┌───────────────────────────────┐
                      │   Next.js 14 Standalone App   │
                      │  - Node.js 20 Alpine Linux    │
                      │  - Non-root user (nextjs:1001)│
                      │  - Port 3000 Internal         │
                      └──────────────┬────────────────┘
                                     │ (Connection Pooling)
                                     ▼
                      ┌───────────────────────────────┐
                      │    PostgreSQL 16+ Database    │
                      │  - 53 Relational Tables       │
                      │  - Row-level Locks (FOR UPDATE)
                      │  - Trigram & Unique Indexes   │
                      └───────────────────────────────┘
```

---

## 2. Deployment Prerequisites

1. Target host: Linux VM (Ubuntu 22.04 LTS / Debian 12 / Amazon Linux 2023) with Docker & Docker Compose installed.
2. DNS: A records pointing `ops.sunpower.in` to the host's public IP address.
3. Network ports: Inbound traffic open on ports `80` (HTTP) and `443` (HTTPS).
4. Environment secrets file populated on the host at `/opt/solaros/.env.production`.

---

## 3. Step-by-Step Production Deployment (Docker Compose)

### Step 1: Clone Repository & Checkout Release Tag
```bash
git clone https://github.com/SunPower/SolarOS.git /opt/solaros
cd /opt/solaros
git checkout v1.1.0
```

### Step 2: Inject Production Environment
```bash
cp /secure/vault/.env.production /opt/solaros/.env
```

### Step 3: Run Database Migrations
```bash
docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy
```

### Step 4: Build & Launch Services
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 5: Verify Container Health
```bash
docker compose -f docker-compose.prod.yml ps
```
Ensure all containers (`solaros-prod-app`, `solaros-prod-proxy`, `solaros-prod-db`) report `Up (healthy)` or `Up`.

---

## 4. Bare-Metal / VM Deployment (PM2 + System Nginx)

For non-containerized VM deployments:

```bash
# 1. Install & build
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

# 2. Launch PM2 cluster
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# 3. Reload system Nginx
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp nginx/conf.d/solaros.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. Post-Deployment Health Verification

Execute the following verification requests immediately following deployment:

1. **Proxy & HTTP Redirection Check:**
   ```bash
   curl -I http://ops.sunpower.in/
   # Expect: HTTP/1.1 301 Moved Permanently -> https://ops.sunpower.in/
   ```

2. **Application Liveness:**
   ```bash
   curl -I https://ops.sunpower.in/
   # Expect: HTTP/2 200
   ```

3. **Database Health via CRM Leads Endpoint:**
   ```bash
   curl -I https://ops.sunpower.in/leads
   # Expect: HTTP/2 200
   ```

4. **Transactional Outbox Worker Cron:**
   ```bash
   curl -X POST https://ops.sunpower.in/api/v1/cron/outbox \
     -H "Authorization: Bearer <CRON_SECRET>"
   # Expect: {"success": true, "processed": ...}
   ```

