// ETL: MongoDB → PostgreSQL for the PURCHASES slice (purchase orders, bills)
// with their line items as child rows. Idempotent. Run after the core ETL and
// after `npx prisma migrate dev --name add_purchases`.
//
//   node scripts/migrate-purchases-to-postgres.mjs
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
const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const json = (o) => JSON.parse(JSON.stringify(o));

function mapLine(it, i) {
  return {
    lineNumber: it.lineNumber ?? i + 1,
    productLegacyId: id(it.product?.id ?? it.productId),
    description: it.description ?? "",
    unit: it.unit ?? "pcs",
    quantity: num(it.quantity),
    unitPrice: num(it.unitPrice),
    vatRate: num(it.vat?.rate ?? it.taxRate),
    vatAmount: num(it.vat?.amount ?? it.taxAmount),
    lineTotal: num(it.lineTotal ?? it.amount),
  };
}

async function main() {
  await mongo.connect();
  const db = mongo.db();
  const companies = await prisma.company.findMany({ select: { id: true, legacyMongoId: true } });
  const companyMap = new Map(companies.map((c) => [c.legacyMongoId, c.id]));

  // ── Purchase orders ───────────────────────────────────────
  const pos = await db.collection("purchaseorders").find().toArray();
  let poLines = 0;
  for (const po of pos) {
    const companyId = companyMap.get(id(po.companyId));
    if (!companyId) continue;
    const header = {
      companyId,
      poNumber: po.poNumber ?? id(po._id),
      poDate: po.poDate ?? null,
      expectedDeliveryDate: po.expectedDeliveryDate ?? null,
      status: po.status ?? "draft",
      supplierRef: id(po.supplier?.partyId),
      supplierName: po.supplier?.name ?? null,
      supplierEmail: po.supplier?.email ?? null,
      currency: po.currency ?? "KES",
      subtotal: num(po.subtotal ?? po.totals?.subtotal),
      taxTotal: num(po.taxTotal ?? po.totals?.taxTotal ?? po.totals?.vat),
      total: num(po.total ?? po.totals?.total ?? po.grandTotal),
      raw: json(po),
    };
    const row = await prisma.purchaseOrder.upsert({
      where: { legacyMongoId: id(po._id) },
      update: header,
      create: { legacyMongoId: id(po._id), ...header },
    });
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: row.id } });
    const items = po.items ?? po.lineItems ?? [];
    if (items.length) {
      await prisma.purchaseOrderLine.createMany({
        data: items.map((it, i) => ({ legacyKey: `${id(po._id)}#${i}`, purchaseOrderId: row.id, ...mapLine(it, i) })),
      });
      poLines += items.length;
    }
  }
  console.log(`Purchase orders: ${pos.length} (lines: ${poLines})`);

  // ── Bills ─────────────────────────────────────────────────
  const bills = await db.collection("bills").find().toArray();
  let billLines = 0;
  for (const b of bills) {
    const companyId = companyMap.get(id(b.companyId));
    if (!companyId) continue;
    const header = {
      companyId,
      billNumber: b.billNumber ?? id(b._id),
      supplierInvoiceNumber: b.supplierInvoiceNumber ?? null,
      billDate: b.billDate ?? null,
      dueDate: b.dueDate ?? null,
      status: b.status ?? "draft",
      supplierRef: id(b.supplier?.partyId),
      supplierName: b.supplier?.name ?? null,
      supplierEmail: b.supplier?.email ?? null,
      currency: b.currency ?? "KES",
      subtotal: num(b.subtotal ?? b.totals?.subtotal),
      taxTotal: num(b.taxTotal ?? b.totals?.taxTotal ?? b.totals?.vat),
      total: num(b.total ?? b.totals?.total ?? b.grandTotal),
      amountPaid: num(b.amountPaid ?? b.totals?.amountPaid),
      balance: num(b.balance ?? b.totals?.balance),
      raw: json(b),
    };
    const row = await prisma.bill.upsert({
      where: { legacyMongoId: id(b._id) },
      update: header,
      create: { legacyMongoId: id(b._id), ...header },
    });
    await prisma.billLine.deleteMany({ where: { billId: row.id } });
    const items = b.items ?? b.lineItems ?? [];
    if (items.length) {
      await prisma.billLine.createMany({
        data: items.map((it, i) => ({ legacyKey: `${id(b._id)}#${i}`, billId: row.id, ...mapLine(it, i) })),
      });
      billLines += items.length;
    }
  }
  console.log(`Bills: ${bills.length} (lines: ${billLines})`);

  console.log("\n✅ Purchases slice migrated.");
}

main()
  .catch((e) => {
    console.error("\n❌ Purchases migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongo.close();
    await prisma.$disconnect();
  });
