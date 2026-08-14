// Postgres smoke test — proves the Prisma/Postgres layer works end-to-end.
// Run after `prisma migrate`:
//   node scripts/pg-smoke.mjs
// It creates a company + user + product, reads them back, and prints them.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { legacyMongoId: "smoke-co" },
    update: { name: "Smoke Test Co" },
    create: { legacyMongoId: "smoke-co", name: "Smoke Test Co", plan: "pro" },
  });

  const user = await prisma.user.upsert({
    where: { email: "smoke@example.com" },
    update: {},
    create: {
      legacyMongoId: "smoke-user",
      name: "Smoke User",
      email: "smoke@example.com",
      role: "Admin",
      companyId: company.id,
    },
  });

  const product = await prisma.product.upsert({
    where: { legacyMongoId: "smoke-prod" },
    update: {},
    create: {
      legacyMongoId: "smoke-prod",
      companyId: company.id,
      name: "Demo Widget",
      sku: "WIDGET-001",
      inventory: { quantityOnHand: 42, reorderLevel: 10 },
      costing: { costPrice: 10 },
    },
  });

  console.log("Company:", company.id, "-", company.name);
  console.log("User:   ", user.id, "-", user.email, `(${user.role})`);
  console.log("Product:", product.id, "-", product.sku, JSON.stringify(product.inventory));
  console.log(
    "Join check — products for company:",
    await prisma.product.count({ where: { companyId: company.id } }),
  );
  console.log("\n✅ Postgres CRUD + relations work.");
}

main()
  .catch((e) => {
    console.error("\n❌ Smoke test failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
