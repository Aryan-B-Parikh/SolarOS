#!/usr/bin/env bash
# Applies the extra SQLite objects (FR-5.5 dispatch gate trigger) to db/custom.db.
# Run automatically after `bun run db:push` (see package.json).
set -euo pipefail
cd "$(dirname "$0")/../../"
python3 - <<'PY'
import sqlite3, pathlib
sql = pathlib.Path('scripts/db/triggers.sql').read_text()
con = sqlite3.connect('db/custom.db')
con.executescript(sql)
rows = con.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall()
print('triggers now in db:', [r[0] for r in rows])
con.close()
PY
