#!/bin/bash
# T1 verification: start dev server, trigger outbox + digest cron jobs.
cd /home/z/my-project
SECRET=$(grep '^CRON_SECRET=' .env | cut -d'"' -f2)
bun run dev > /tmp/t1-dev3.log 2>&1 &
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "HOME_HTTP=$code"
echo "=== OUTBOX RUN ==="
curl -s -w '\nOUTBOX_HTTP=%{http_code} time=%{time_total}s\n' -X POST http://localhost:3000/api/v1/cron/outbox -H "x-cron-secret: $SECRET" --max-time 300
echo "=== DIGEST RUN ==="
curl -s -w '\nDIGEST_HTTP=%{http_code} time=%{time_total}s\n' -X POST http://localhost:3000/api/v1/cron/digest -H "x-cron-secret: $SECRET" --max-time 300
echo "=== SERVER STILL ALIVE? ==="
curl -s -o /dev/null -w 'AFTER_HTTP=%{http_code}\n' --max-time 15 http://localhost:3000/ 2>/dev/null || echo "AFTER_HTTP=dead"
