# Postgres setup & Phase 0 runbook

This gets a working PostgreSQL backend for the **core slice** (companies, users,
categories, products, stock movements) running next to your existing MongoDB,
and proves it end-to-end. It changes **nothing** about the running app until you
explicitly flip a flag. Full plan: `POSTGRES_MIGRATION_PLAN.md`.

## What's included

- `prisma/schema.prisma` — Prisma models for the core slice
- `lib/prisma.js` — Prisma client singleton
- `docker-compose.postgres.yml` — local Postgres 16
- `scripts/pg-smoke.mjs` — proves CRUD + relations against Postgres
- `scripts/migrate-core-to-postgres.mjs` — ETL from your Mongo data
- `app/data/productRepo.js` — the data-access seam (Mongo default, Postgres opt-in)

## 1. Install dependencies

```
npm install -D prisma
npm install @prisma/client
```

## 2. Start Postgres

```
docker compose -f docker-compose.postgres.yml up -d
```

Add to `.env.local`:

```
DATABASE_URL=postgresql://erp:erp@localhost:5432/erpinventory?schema=public
```

## 3. Create the schema

```
npx prisma migrate dev --name init_core
```

This generates the Prisma client and creates the tables. (`npx prisma studio`
opens a browser DB viewer if you want to look.)

## 4. Prove it works

```
node scripts/pg-smoke.mjs
```

Expected: it prints a created Company, User, Product and a join count, ending
with `✅ Postgres CRUD + relations work.` — that's your "it's working" checkpoint.

## 5. Migrate your real data (optional, when ready)

With `MONGODB_URI` still pointing at your live Mongo:

```
node scripts/migrate-core-to-postgres.mjs
```

Idempotent — re-runnable. Prints counts per collection. Verify row counts match
Mongo (e.g. in `prisma studio` or `psql`).

## 6. Try a read through Postgres (safe, reversible)

The app still uses Mongo everywhere by default. To exercise the Postgres path for
products in a script or a scratch route, set the flag and call the repo:

```
DATA_BACKEND=postgres node -e "import('./app/data/productRepo.js').then(async m => console.log(await m.countProducts()))"
```

To flip back, just unset `DATA_BACKEND` (or set it to `mongo`). No code changes.

## Rollback

- Nothing in the app reads Postgres unless `DATA_BACKEND=postgres` **and** a
  caller uses `productRepo`. Remove the env var to fully revert.
- `docker compose -f docker-compose.postgres.yml down -v` drops the Postgres
  data entirely.

## Next phases (I build these on request)

1. Expand `schema.prisma` to the next module (Sales: quotes/invoices/lines) and
   add its ETL block + repo.
2. Wire the `stocks` list read to `productRepo` behind the flag and soak-compare
   Postgres vs Mongo output.
3. Repeat module by module (Inventory → Sales → Purchases → Finance → HR), then
   move next-auth to the Prisma adapter and decommission Mongo.

> Reminder: this Phase 0 is intentionally a **thin vertical slice** so the whole
> pipeline (schema → migrate → ETL → repo → flag) is proven and runnable before
> we scale it across all ~60 models. That staging is what keeps the app working
> the entire way.
