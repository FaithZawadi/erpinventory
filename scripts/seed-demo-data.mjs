// Seed a small, coherent DEMO dataset into MongoDB so the Postgres ETLs and the
// /dashboard/settings/database parity page show real numbers. Every doc is
// tagged { demo: true } so it's easy to find and remove.
//
//   node scripts/seed-demo-data.mjs          # (re)create the demo data
//   node scripts/seed-demo-data.mjs --clean  # remove the demo data only
//
// Uses the raw mongodb driver (bypasses Mongoose validation) — this is demo
// data for migration testing, not a substitute for creating records in the app.
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not set (checked .env.local and .env).");
  process.exit(1);
}

const CLEAN = process.argv.includes("--clean");
const COLLECTIONS = [
  "companies", "categories", "products", "accounts", "parties",
  "invoices", "quotes", "stockmovements", "journalentries",
];

const mongo = new MongoClient(uri);
const now = new Date();

async function main() {
  await mongo.connect();
  const db = mongo.db();

  // Always clear prior demo docs first (idempotent).
  for (const c of COLLECTIONS) {
    const res = await db.collection(c).deleteMany({ demo: true });
    if (res.deletedCount) console.log(`  cleared ${res.deletedCount} demo doc(s) from ${c}`);
  }
  if (CLEAN) {
    console.log("\n✅ Demo data removed.");
    return;
  }

  const companyId = new ObjectId();
  await db.collection("companies").insertOne({
    _id: companyId, name: "Demo Trading Co", plan: "pro", demo: true, createdAt: now, updatedAt: now,
  });

  const catId = new ObjectId();
  await db.collection("categories").insertOne({
    _id: catId, companyId, name: "Hardware", description: "Demo category",
    isActive: true, isDeleted: false, level: 0, path: "", sortOrder: 0, productCount: 3,
    demo: true, createdAt: now, updatedAt: now,
  });

  const productDefs = [
    ["Steel Bolt M8", "BOLT-M8", 500, 12],
    ["Hex Nut M8", "NUT-M8", 800, 6],
    ["Washer M8", "WASH-M8", 1200, 3],
  ];
  const productIds = [];
  for (const [name, SKU, qty, cost] of productDefs) {
    const _id = new ObjectId();
    productIds.push(_id);
    await db.collection("products").insertOne({
      _id, companyId, name, SKU, type: "Inventory Item", unit: "pcs", category: "Hardware",
      inventory: { quantityOnHand: qty, quantityAvailable: qty, reorderLevel: 50 },
      costing: { costPrice: cost }, demo: true, createdAt: now, updatedAt: now,
    });
  }

  const accountDefs = [
    ["1000", "Cash at Bank", "asset", "cash_at_bank"],
    ["1100", "Accounts Receivable", "asset", "accounts_receivable"],
    ["2000", "Accounts Payable", "liability", "accounts_payable"],
    ["2100", "VAT Payable", "liability", null],
    ["4000", "Sales Revenue", "revenue", null],
    ["5000", "Cost of Goods Sold", "expense", null],
  ];
  const acct = {};
  for (const [accountCode, accountName, accountType, systemAccount] of accountDefs) {
    const _id = new ObjectId();
    acct[accountCode] = _id;
    await db.collection("accounts").insertOne({
      _id, companyId, accountCode, accountName, accountType, systemAccount,
      canPost: true, isActive: true, currency: "KES", cachedBalance: 0, level: 0, path: "",
      demo: true, createdAt: now, updatedAt: now,
    });
  }

  const partyId = new ObjectId();
  await db.collection("parties").insertOne({
    _id: partyId, companyId, name: "Acme Buyer Ltd", type: "customer",
    email: "buyer@acme.example", demo: true, createdAt: now, updatedAt: now,
  });

  // Invoice: 2 lines, 16% VAT.
  const invItems = [
    { lineNumber: 1, itemType: "product", productId: productIds[0], description: "Steel Bolt M8", unit: "pcs", quantity: 100, unitPrice: 20, taxRate: 16, taxAmount: 320, discountAmount: 0, lineTotal: 2320 },
    { lineNumber: 2, itemType: "product", productId: productIds[1], description: "Hex Nut M8", unit: "pcs", quantity: 100, unitPrice: 10, taxRate: 16, taxAmount: 160, discountAmount: 0, lineTotal: 1160 },
  ];
  const invSub = 3000, invTax = 480, invTotal = 3480;
  await db.collection("invoices").insertOne({
    _id: new ObjectId(), companyId, invoiceNumber: "DEMO-INV-001", invoiceDate: now,
    dueDate: new Date(now.getTime() + 30 * 864e5), status: "sent",
    customer: { id: String(partyId), name: "Acme Buyer Ltd", email: "buyer@acme.example" },
    items: invItems, subtotal: invSub, taxTotal: invTax, total: invTotal,
    amountPaid: 0, balance: invTotal, currency: "KES", demo: true, createdAt: now, updatedAt: now,
  });

  await db.collection("quotes").insertOne({
    _id: new ObjectId(), companyId, quoteNumber: "DEMO-QUO-001", quoteDate: now, status: "draft",
    customer: { id: String(partyId), name: "Acme Buyer Ltd" },
    items: [{ lineNumber: 1, itemType: "product", product: { id: productIds[2] }, description: "Washer M8", unit: "pcs", quantity: 200, unitPrice: 5, taxRate: 16, taxAmount: 160, discountAmount: 0, lineTotal: 1160 }],
    subtotal: 1000, taxTotal: 160, total: 1160, currency: "KES", demo: true, createdAt: now, updatedAt: now,
  });

  await db.collection("stockmovements").insertMany([
    { _id: new ObjectId(), companyId, movementNumber: "DEMO-MV-001", productId: productIds[0], movementType: "sale", direction: "out", quantity: 100, previousStock: 500, newStock: 400, demo: true, createdAt: now },
    { _id: new ObjectId(), companyId, movementNumber: "DEMO-MV-002", productId: productIds[1], movementType: "sale", direction: "out", quantity: 100, previousStock: 800, newStock: 700, demo: true, createdAt: now },
  ]);

  // Balanced journal entry for the sale: DR AR 3480, CR Sales 3000, CR VAT 480.
  await db.collection("journalentries").insertOne({
    _id: new ObjectId(), companyId, entryNumber: "DEMO-JE-001", entryDate: now, entryType: "invoice",
    description: "Demo sale — invoice DEMO-INV-001", status: "posted",
    lines: [
      { accountId: acct["1100"], accountType: "asset", debit: 3480, credit: 0 },
      { accountId: acct["4000"], accountType: "revenue", debit: 0, credit: 3000 },
      { accountId: acct["2100"], accountType: "liability", debit: 0, credit: 480 },
    ],
    demo: true, createdAt: now, updatedAt: now,
  });

  console.log("\nSeeded demo data:");
  console.log("  companies: 1  categories: 1  products: 3  accounts: 6  parties: 1");
  console.log("  invoices: 1  quotes: 1  stock movements: 2  journal entries: 1 (balanced 3480/3480)");
  console.log("\nNext: re-run the ETLs, then open /dashboard/settings/database");
  console.log("  node scripts/migrate-core-to-postgres.mjs");
  console.log("  node scripts/migrate-sales-to-postgres.mjs");
  console.log("  node scripts/migrate-finance-to-postgres.mjs");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => mongo.close());
