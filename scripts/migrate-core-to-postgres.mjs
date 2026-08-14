// ETL: MongoDB → PostgreSQL for the CORE slice (companies, users, categories,
// products, stock movements). Idempotent — upserts by legacyMongoId so it can
// be re-run safely. Reads raw docs via the mongodb driver (no model imports)
// and writes via Prisma.
//
//   node scripts/migrate-core-to-postgres.mjs
//
// Needs MONGODB_URI (source) and DATABASE_URL (target) in .env.local/.env.
import { MongoClient } from "mongodb";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("MONGODB_URI not set.");
  process.exit(1);
}

const prisma = new PrismaClient();
const mongo = new MongoClient(mongoUri);
const id = (v) => (v == null ? null : String(v));

async function main() {
  await mongo.connect();
  const db = mongo.db();

  // ── Companies ─────────────────────────────────────────────
  const companyMap = new Map(); // legacy _id → new uuid
  const companies = await db.collection("companies").find().toArray();
  for (const c of companies) {
    const row = await prisma.company.upsert({
      where: { legacyMongoId: id(c._id) },
      update: { name: c.name ?? "Company" },
      create: {
        legacyMongoId: id(c._id),
        name: c.name ?? "Company",
        plan: c.plan ?? c.subscriptionPlan ?? "free",
      },
    });
    companyMap.set(id(c._id), row.id);
  }
  console.log(`Companies: ${companies.length}`);

  // ── Users ─────────────────────────────────────────────────
  const users = await db.collection("users").find().toArray();
  for (const u of users) {
    const email = (u.email ?? "").toLowerCase();
    if (!email) continue;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        legacyMongoId: id(u._id),
        name: u.name ?? "User",
        email,
        password: u.password ?? null,
        role: u.role ?? "User",
        status: u.status ?? "Active",
        department: u.department ?? null,
        authProvider: u.authProvider ?? "credentials",
        tokenVersion: u.tokenVersion ?? 0,
        avatar: u.avatar ?? null,
        companyId: u.companyId ? companyMap.get(id(u.companyId)) ?? null : null,
      },
    });
  }
  console.log(`Users: ${users.length}`);

  // ── Categories (two passes: rows first, then parent links) ─
  const categories = await db.collection("categories").find().toArray();
  const categoryMap = new Map();
  for (const c of categories) {
    const companyId = companyMap.get(id(c.companyId));
    if (!companyId) continue;
    const row = await prisma.category.upsert({
      where: { legacyMongoId: id(c._id) },
      update: {},
      create: {
        legacyMongoId: id(c._id),
        companyId,
        name: c.name ?? "Category",
        description: c.description ?? null,
        path: c.path ?? "",
        level: c.level ?? 0,
        customFields: c.customFields ?? null,
        sortOrder: c.sortOrder ?? 0,
        isActive: c.isActive ?? true,
        isDeleted: c.isDeleted ?? false,
        productCount: c.productCount ?? 0,
      },
    });
    categoryMap.set(id(c._id), { newId: row.id, parent: id(c.parent) });
  }
  for (const [, { newId, parent }] of categoryMap) {
    if (!parent) continue;
    const parentNew = categoryMap.get(parent)?.newId;
    if (parentNew) {
      await prisma.category.update({ where: { id: newId }, data: { parentId: parentNew } });
    }
  }
  console.log(`Categories: ${categories.length}`);

  // ── Products ──────────────────────────────────────────────
  const products = await db.collection("products").find().toArray();
  const productMap = new Map();
  for (const p of products) {
    const companyId = companyMap.get(id(p.companyId));
    if (!companyId) continue;
    const row = await prisma.product.upsert({
      where: { legacyMongoId: id(p._id) },
      update: {},
      create: {
        legacyMongoId: id(p._id),
        companyId,
        name: p.name ?? "Product",
        type: p.type ?? "Inventory Item",
        sku: p.SKU ?? p.sku ?? id(p._id),
        description: p.description ?? null,
        category: typeof p.category === "string" ? p.category : null,
        unit: p.unit ?? "pcs",
        inventory: p.inventory ?? null,
        costing: p.costing ?? null,
      },
    });
    productMap.set(id(p._id), row.id);
  }
  console.log(`Products: ${products.length}`);

  // ── Stock movements ───────────────────────────────────────
  const movements = await db.collection("stockmovements").find().toArray();
  let mv = 0;
  for (const m of movements) {
    const companyId = companyMap.get(id(m.companyId));
    const productId = productMap.get(id(m.productId));
    if (!companyId || !productId) continue;
    await prisma.stockMovement.upsert({
      where: { legacyMongoId: id(m._id) },
      update: {},
      create: {
        legacyMongoId: id(m._id),
        companyId,
        productId,
        movementNumber: m.movementNumber ?? id(m._id),
        movementType: m.movementType ?? "adjustment",
        direction: m.direction ?? "in",
        quantity: m.quantity ?? 0,
        previousStock: m.previousStock ?? 0,
        newStock: m.newStock ?? 0,
        costing: m.costing ?? null,
      },
    });
    mv++;
  }
  console.log(`Stock movements: ${mv}/${movements.length}`);

  console.log("\n✅ Core slice migrated. Verify with: node scripts/pg-smoke.mjs");
}

main()
  .catch((e) => {
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongo.close();
    await prisma.$disconnect();
  });
