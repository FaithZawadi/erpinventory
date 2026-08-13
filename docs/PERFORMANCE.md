# Performance guide

Practical steps to make erpinventory load fast, ordered by impact. Grounded in
this codebase (Next.js 16 / Turbopack, React 19, Mongoose/MongoDB).

## TL;DR — the biggest levers

1. **Don't judge speed from `next dev`.** Dev + Turbopack recompiles each route
   on first visit (`○ Compiling /…`). Always benchmark with a production build:
   ```
   npm run build
   npm start
   ```
   This alone removes most of the "lag".

2. **Stop rebuilding indexes on every boot.** `app/config/dbConnect.js` syncs
   all schema indexes unless `MONGO_AUTOINDEX=false`. With ~60 models this is a
   real boot cost. Do it once, then disable:
   ```
   node scripts/sync-indexes.mjs        # build/sync indexes once
   ```
   then set in `.env.local` (and your host):
   ```
   MONGO_AUTOINDEX=false
   ```

3. **Put the database close to the app.** If `MONGODB_URI` points at an Atlas
   cluster in a distant region, every query pays that round-trip. Use a region
   near your app host (or a local MongoDB for dev). Consider raising the pool:
   `maxPoolSize` is currently 5 in `dbConnect.js`.

## Application-level wins

4. **Kill per-page external requests.** The sidebar avatar previously fetched
   `github.com/shadcn.png` on every render when a user had no image — now fixed
   to render the initials fallback with no network call. Audit for other
   external `<img>`/`fetch` on hot paths.

5. **`.lean()` on read-only queries.** Reads that are only serialized to the
   client should use `.lean()` (returns plain objects, skips Mongoose hydration).
   The hot dashboard queries already use aggregation + `.lean()`; extend the same
   to any list/read query that does **not** later call `.save()` or use virtuals.
   Rule of thumb:
   ```js
   // read-only → lean
   const rows = await Model.find(match).select(fields).limit(n).lean();
   ```

6. **Cache heavy dashboard queries across requests.** Today `dashboard-cache.js`
   uses `React.cache()`, which only dedupes within a *single* render. For data
   that can be a little stale, wrap in `unstable_cache` so it is reused across
   requests:
   ```js
   import { unstable_cache } from "next/cache";
   export const getStatsCached = unstable_cache(
     async (companyId) => getStats(companyId),
     ["dashboard-stats"],
     { revalidate: 60, tags: ["dashboard"] }, // 60s TTL
   );
   ```
   Invalidate with `revalidateTag("dashboard")` on the relevant writes.

7. **Index the fields you filter/sort on.** Every hot query should be covered by
   an index. In Mongo shell: `db.collection.find(<query>).explain("executionStats")`
   — if `stage: COLLSCAN`, add an index. Common ones here: `{ companyId: 1 }` on
   every tenant collection, plus compound indexes for the dashboard date-range
   aggregations (e.g. `{ companyId: 1, entryDate: -1, status: 1 }` on journal
   entries).

8. **Pay down the client bundle.** Heavy client components (command palette,
   charts) should be `next/dynamic` imported where not needed on first paint, and
   Recharts panels lazy-loaded below the fold.

## Quick checklist

- [ ] Benchmark with `npm run build && npm start`, not `next dev`
- [ ] `node scripts/sync-indexes.mjs` then `MONGO_AUTOINDEX=false`
- [ ] DB in a nearby region; `maxPoolSize` tuned
- [ ] `.lean()` on read-only list queries
- [ ] `unstable_cache` on heavy dashboard aggregations with a sane `revalidate`
- [ ] `explain()` hot queries; add missing indexes
- [ ] Only one dev server running; `rm -rf .next` when the cache goes stale
