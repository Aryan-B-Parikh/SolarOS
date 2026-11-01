# Task 2-b — Settings hub MVP gaps (FR-9.1 / FR-9.2 / FR-9.3)

Agent: 2-b · Date: 2026-10-31 · Status: DONE

## Files changed (all verified lint-clean)

Backend (all follow the established handler/handlerWithSchema + requireCapability + `audit()` from `src/lib/outbox.ts` pattern):

1. `src/app/api/v1/users/route.ts` (NEW) — GET list users (id, name, email, phone, role, isActive, lastLoginAt, createdAt; `users.manage`); POST create user (name/email unique/phone/role enum/password min 8 → `hashPassword` from `@/lib/auth` = same scrypt `salt:hash` scheme as seed; conflict → CONFLICT). Audits `USER_CREATE`.
2. `src/app/api/v1/users/[id]/route.ts` (NEW) — PATCH name/phone/role/isActive/password(optional reset). Never deletes. Blocks deactivating your own account (VALIDATION_FAILED). Audits `USER_UPDATE` with before/after (no passwordHash; `passwordReset: true` flag on resets).
3. `src/app/api/v1/audit/route.ts` (NEW) — GET `?entity=&entityId=&action=&from=&to=&page=1` → latest-first, 50/page, `{entries, page, pageSize, total, pageCount}`; each entry has `actorName` resolved actorId→User.name ("Customer"/"System" otherwise); `audit.read`.
4. `src/app/api/v1/products/route.ts` — extended with POST (create incl. warranty terms warrantyMonths/warrantyStartBasis; unique SKU → CONFLICT). Audits `PRODUCT_CREATE`.
5. `src/app/api/v1/products/[id]/route.ts` (NEW) — PATCH name/brand/category/isSerialized/warrantyMonths/warrantyStartBasis/stdCostPaise/salePricePaise/reorderLevel/monitoringUrl; audits `PRODUCT_UPDATE` with changed-field before/after.
6. `src/app/api/v1/templates/route.ts` — GET now honours `?all=1` (only when caller has `templates.write`) so settings can see/re-activate inactive templates; other consumers unchanged.
7. `src/app/api/v1/templates/[id]/route.ts` (NEW) — PATCH meta (name/isActive/defaultCableDistanceM/labourAllowancePaise/priceOverridePaise) + optional full BOM lines replace (rule vocabulary FIXED/PANEL_COUNT/PER_PANEL/PER_KW/PER_CABLE_METER, value, allowance, sortOrder; duplicate product / unknown product rejected); version bumps on BOM change; audits `TEMPLATE_UPDATE` with full before/after snapshot.
8. `src/app/api/v1/settings/route.ts` — PATCH zod schema extended with `defaultTariffPaise`, `slaHoursByPriority {LOW,NORMAL,HIGH,URGENT}`, `businessStartHour`, `businessEndHour`, `businessDays (ints 0–6, ≥1)` + superRefine start<end guard. Existing fields untouched; `src/lib/settings.ts` NOT modified.
9. `src/app/api/v1/expenses/route.ts` — ONLY added `audit()` after successful `recordExpense` (entity EXPENSE, action `EXPENSE_RECORD`, after = category/amountPaise/incurredOn/description). Nothing else touched.

Frontend:

10. `src/components/app/views-settings.tsx` (rewrite) — role-gated via `/auth/me` fetched in the view (App.tsx untouched): DIRECTOR sees Business / Products / Templates & BOM / Users / Audit log; ACCOUNTS sees Audit log only; other roles get an empty-state. Business tab upgraded with Default tariff (Rs/kWh ↔ paise), 4 SLA-hours inputs, business start/end hour inputs and Mon–Sun working-day checkboxes. Products tab = table + Add/Edit dialog with a labelled "Warranty terms" section (months + starts-on delivery/sign-off) and serialized switch. Templates tab = template cards + Edit dialog (meta + inline BOM line editor: product select, rule select, value, allowance, add/remove rows). Users tab = CRUD table + create dialog + active/inactive Switch (disabled for self) + pencil edit + KeyRound reset-password dialog. Audit tab = entity/action/entityId/date-range filters + paginated 50-per-page table (time, actor, entity chip, action code, before/− after/+ JSON diff), sticky header + scrollable (max-h + `scroll-thin`). NotificationsView kept as-is (App.tsx imports it).

## Verification results

- `bun run lint`: **my owned files → 0 problems**. Full-repo run currently shows 2 errors in `src/components/app/views-field.tsx` (react-hooks/set-state-in-effect at 338:7 and 497:7) + 2 unused-directive warnings — introduced by the parallel agent that owns views-field.tsx, NOT by this task (an earlier full run during this task was 0 errors).
- Smoke tests (curl, director session):
  - GET /users 200 (full staff list) · POST /users 200 → created TEST_USER → **logged in as TEST_USER** (proves hash scheme) → PATCH deactivate 200 → login now rejected · self-deactivation guard 400 "You cannot deactivate your own account" · SUPPORT role GET /users → 403.
  - GET /audit 200 (latest-first, actor names resolved e.g. "Priya Deshmukh", total+pageCount) · `?entity=user` filter OK · ACCOUNTS role → 200; SUPPORT/others → 403.
  - PATCH /settings {"defaultTariffPaise":700,"slaHoursByPriority":{"LOW":168,"NORMAL":72,"HIGH":24,"URGENT":4}} → 200, persisted; start≥end guard → 400 with field error.
  - Product reorderLevel 24→42→24 round-trip 200×2; audit shows `PRODUCT_UPDATE {reorderLevel:24} → {reorderLevel:42}`; duplicate SKU POST → 409.
  - Template meta PATCH (cable 25→20) 200; full BOM lines replace round-trip 200 (13 lines intact, version 1→2); `TEMPLATE_UPDATE` audit rows present.
  - POST /expenses 200 → `EXPENSE_RECORD` audit row with category FUEL + amountPaise 35050.
- Browser (agent-browser, headless): logged in as director → `#/settings` renders all 5 tabs; Users / Audit / Products / Templates tab panels all render live data; `agent-browser errors` clean (only `[HMR] connected` in console).
- dev.log: `✓ Compiled` — no compile errors.

## Cleanup / state left behind

- TEST_USER (`testuser-2b@sunpower.example`, role SUPPORT) **left deactivated** as instructed (audit rows for its create/update kept).
- Directly deleted (prisma one-off, by exact id) the two throwaway rows that would have polluted demo data: test product `TEST-2B-1` and the smoke expense (₹350.50 FUEL) plus their 2 audit rows. The PANEL product's honest reorderLevel audit history (24→42→24) remains.
- Settings PATCH test set values identical to seeded defaults — no data change.
- Off-Grid 2 kW template now at version 2 (BOM lines round-trip test) — content unchanged.

## Outside my scope / notes for other agents

- `views-field.tsx` currently has 2 react-hooks/set-state-in-effect lint errors (lines ~338, ~497) introduced by the parallel field-view agent — owner should fix.
- App.tsx NAV still gates the "Settings" link to DIRECTOR only; if ACCOUNTS should get a nav entry for the audit tab, that's App.tsx (not my file). ACCOUNTS can still reach `#/settings` directly by URL and will see only the Audit tab.
- `#/s` is not a settings route in App.tsx — the hash route is `#/settings`.
