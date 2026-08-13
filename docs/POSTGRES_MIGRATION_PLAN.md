# MongoDB → PostgreSQL migration plan

A best-practice, **staged** plan to move erpinventory from MongoDB/Mongoose to
PostgreSQL without a big-bang rewrite and without breaking the running app.

> **Reality check.** This touches ~60 models, ~946 query calls, ~50 server-action
> files, the next-auth layer, and dozens of aggregation pipelines. It is a
> multi-week project. Postgres will not by itself make the app faster — do the
> steps in `PERFORMANCE.md` first for immediate speed. Migrate for the reasons
> Postgres actually wins: relational integrity, transactions, SQL reporting,
> and BI/tooling — not raw latency.

## 1. Principles

- **The app keeps working at every step.** No phase leaves `main` broken.
- **One data-access layer.** App code must stop calling Mongoose directly and go
  through repositories, so the storage engine can be swapped underneath.
- **Incremental, per-module cutover** behind a feature flag, with dual-run and
  verification before flipping reads/writes.
- **Reversible.** Every phase can be rolled back until the final decommission.

## 2. Technology choice

**Recommended: PostgreSQL 16 + Prisma ORM.**
- Type-safe schema, first-class migrations (`prisma migrate`), a next-auth
  adapter, and good JSONB support for fields that are genuinely document-shaped.
- Alternative: **Drizzle** (lighter, SQL-first) if you prefer raw-SQL control.
  Either works; the plan below assumes Prisma.

## 3. Schema translation rules (Mongoose → Postgres)

| Mongoose | Postgres |
|---|---|
| `_id: ObjectId` | `id uuid default gen_random_uuid()` (keep a `legacy_mongo_id text` during migration for backfill mapping) |
| `ref: "Model"` | real `FOREIGN KEY` (`account_id uuid references accounts(id)`) |
| `companyId` (tenant) | `tenant_id uuid` on every table + index; optionally Postgres **Row-Level Security** per tenant |
| Embedded sub-doc (1:1) | columns on the same table, or a `jsonb` column if truly free-form |
| Array of sub-docs (1:many) | a **child table** with a FK (e.g. `journal_entry_lines`) — do **not** keep as JSONB when you query/aggregate on it |
| Free-form / rarely-queried object | `jsonb` column |
| `enum` | Postgres `enum` type or a `text` + `CHECK` |
| `timestamps` | `created_at timestamptz`, `updated_at timestamptz` |
| Mongo aggregation pipeline | SQL view / query (the dashboard/report pipelines are the largest rewrite) |

Line-item collections (journal lines, invoice lines, GRN lines) become proper
child tables — this is where Postgres earns its keep (constraints + joins).

## 4. Phases

### Phase 0 — Foundation (no app change)
- Provision Postgres (managed: RDS / Cloud SQL / Neon / Supabase).
- Add Prisma; hand-author `schema.prisma` from the Mongoose models (start with
  leaf, low-risk models: `Company`, `User`, `Category`, `Product`).
- `prisma migrate dev` to create the schema in a scratch DB. No app wiring yet.

### Phase 1 — Data-access layer (app refactor, still on Mongo)
- Introduce `app/data/<entity>Repo.ts` interfaces (e.g. `productRepo.list()`,
  `productRepo.create()`), backed **by the existing Mongoose code**.
- Migrate server actions/queries to call repositories instead of models directly.
- Ship this while still 100% on MongoDB. Now the app has a seam to swap.

### Phase 2 — ETL / backfill
- Write a migrator that reads each Mongo collection and inserts into Postgres,
  preserving `legacy_mongo_id` so references can be re-pointed to new `uuid` FKs.
- Run repeatedly; verify row counts + spot-check aggregates match Mongo.

### Phase 3 — Read cutover, per module
- Add a Prisma-backed implementation of each repository behind a flag
  (`DATA_BACKEND=postgres` per module).
- Flip **reads** for one module (e.g. Products) to Postgres; keep writing to
  Mongo. Compare dashboards/reports against Mongo for a soak period.

### Phase 4 — Write cutover + dual-run
- Flip **writes** for the module to Postgres (optionally dual-write to Mongo as a
  safety net for one release), backfilling the delta.
- Repeat Phases 3–4 module by module: Inventory → Sales → Purchases → Finance →
  HR → Reports. Finance last (most relational, highest risk).

### Phase 5 — Auth + decommission
- Move next-auth to the Prisma adapter (or keep credentials + Prisma user table).
- Rewrite remaining Mongo aggregations as SQL views/queries.
- Remove Mongoose, `mongodb` driver, dual-write; drop `legacy_mongo_id`.

## 5. Cross-cutting work

- **Transactions:** wrap multi-table writes (e.g. posting a journal entry with
  its lines) in a single Prisma `$transaction` — a real upgrade over Mongo.
- **Reporting:** the heavy dashboard aggregations become SQL (views or
  materialized views refreshed on a schedule).
- **Testing:** the existing `vitest` + `mongodb-memory-server` suite gets a
  parallel Postgres path (e.g. `pg-mem` or a disposable test database) so both
  backends are verified during the dual-run window.
- **Integrations:** the `/api/v1` gateway is REST/DB-agnostic — it keeps working
  throughout (see `INTEGRATION_GATEWAY.md`).

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Aggregation-pipeline rewrites are subtle | Cut over reads behind a flag and diff Postgres vs Mongo before flipping |
| Multi-tenant leakage | `tenant_id` on every table + repository-level tenant scoping (or RLS) |
| Data drift during migration | Dual-write window + `legacy_mongo_id` reconciliation job |
| Big-bang temptation | Enforce the module-by-module order; Finance last |

## 7. Suggested sequencing

Do `PERFORMANCE.md` now (speed today). Then Phase 0–1 (foundation + repository
seam) — these are safe and unlock everything else. Execute Phases 2–5 one module
at a time. Start whenever you're ready and I'll build Phase 0's `schema.prisma`
plus the first repository from the actual models.
