// ETL: MongoDB → PostgreSQL for the SALES slice (invoices, quotes) including
// their line items as child rows. Idempotent — upserts headers by
// legacyMongoId and rebuilds lines each run. Run AFTER the core ETL and after
// `npx prisma migrate dev --name add_sales`.
//
//   node scripts/migrate-sales-to-postgres.mjs
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
const json = (o) => JSON.parse(JSON.stringify(o)); // coerce ObjectId/Date → JSON-safe

function mapLine(it, i) {
  return {
    lineNumber: it.lineNumber ?? i + 1,
    itemType: it.itemType ?? "product",
    productLegacyId: id(it.productId ?? it.product?.id),
    description: it.description ?? "",
    unit: it.unit ?? "pcs",
    quantity: num(it.quantity),
    unitPrice: num(it.unitPrice),
    taxRate: it.taxRate == null ? 16 : num(it.taxRate),
    taxAmount: num(it.taxAmount),
    discountAmount: num(it.discountAmount),
    lineTotal: num(it.lineTotal ?? it.amount),
  };
}

async function main() {
  await mongo.connect();
  const db = mongo.db();

  const companies = await prisma.company.findMany({ select: { id: true, legacyMongoId: true } });
  const companyMap = new Map(companies.map((c) => [c.legacyMongoId, c.id]));

  // ── Invoices ──────────────────────────────────────────────
  const invoices = await db.collection("invoices").find().toArray();
  let invLines = 0;
  for (const inv of invoices) {
    const companyId = companyMap.get(id(inv.companyId));
    if (!companyId) continue;
    const header = {
      companyId,
      invoiceNumber: inv.invoiceNumber ?? id(inv._id),
      invoiceDate: inv.invoiceDate ?? null,
      dueDate: inv.dueDate ?? null,
      status: inv.status ?? "draft",
      customerRef: id(inv.customer?.id),
      customerName: inv.customer?.name ?? null,
      customerEmail: inv.customer?.email ?? null,
      currency: inv.currency ?? "KES",
      subtotal: num(inv.subtotal ?? inv.totals?.subtotal),
      taxTotal: num(inv.taxTotal ?? inv.totals?.taxTotal ?? inv.totals?.tax),
      discountTotal: num(inv.discountTotal ?? inv.totals?.discountTotal),
      total: num(inv.total ?? inv.totals?.total ?? inv.grandTotal),
      amountPaid: num(inv.amountPaid ?? inv.totals?.amountPaid),
      balance: num(inv.balance ?? inv.totals?.balance),
      raw: json(inv),
    };
    const row = await prisma.invoice.upsert({
      where: { legacyMongoId: id(inv._id) },
      update: header,
      create: { legacyMongoId: id(inv._id), ...header },
    });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: row.id } });
    const items = inv.items ?? inv.lineItems ?? [];
    if (items.length) {
      await prisma.invoiceLine.createMany({
        data: items.map((it, i) => ({ legacyKey: `${id(inv._id)}#${i}`, invoiceId: row.id, ...mapLine(it, i) })),
      });
      invLines += items.length;
    }
  }
  console.log(`Invoices: ${invoices.length} (lines: ${invLines})`);

  // ── Quotes ────────────────────────────────────────────────
  const quotes = await db.collection("quotes").find().toArray();
  let qLines = 0;
  for (const q of quotes) {
    const companyId = companyMap.get(id(q.companyId));
    if (!companyId) continue;
    const header = {
      companyId,
      quoteNumber: q.quoteNumber ?? id(q._id),
      quoteDate: q.quoteDate ?? null,
      status: q.status ?? "draft",
      customerRef: id(q.customer?.id),
      customerName: q.customer?.name ?? null,
      customerEmail: q.customer?.email ?? null,
      currency: q.currency ?? "KES",
      subtotal: num(q.subtotal ?? q.totals?.subtotal),
      taxTotal: num(q.taxTotal ?? q.totals?.taxTotal ?? q.totals?.tax),
      discountTotal: num(q.discountTotal ?? q.totals?.discountTotal),
      total: num(q.total ?? q.totals?.total ?? q.grandTotal),
      raw: json(q),
    };
    const row = await prisma.quote.upsert({
      where: { legacyMongoId: id(q._id) },
      update: header,
      create: { legacyMongoId: id(q._id), ...header },
    });
    await prisma.quoteLine.deleteMany({ where: { quoteId: row.id } });
    const items = q.items ?? q.lineItems ?? [];
    if (items.length) {
      await prisma.quoteLine.createMany({
        data: items.map((it, i) => ({ legacyKey: `${id(q._id)}#${i}`, quoteId: row.id, ...mapLine(it, i) })),
      });
      qLines += items.length;
    }
  }
  console.log(`Quotes: ${quotes.length} (lines: ${qLines})`);

  console.log("\n✅ Sales slice migrated.");
}

main()
  .catch((e) => {
    console.error("\n❌ Sales migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongo.close();
    await prisma.$disconnect();
  });
