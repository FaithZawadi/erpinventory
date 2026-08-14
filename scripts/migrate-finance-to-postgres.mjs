// ETL: MongoDB → PostgreSQL for the FINANCE slice — chart of accounts +
// journal entries (double-entry). Order matters: accounts are migrated first
// (two-pass so the parent tree resolves), then journal entries, whose lines get
// a REAL account FK resolved from the account map. Idempotent.
//
//   node scripts/migrate-finance-to-postgres.mjs
//
// Run after the core ETL and `npx prisma migrate dev --name add_finance`.
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

async function main() {
  await mongo.connect();
  const db = mongo.db();
  const companies = await prisma.company.findMany({ select: { id: true, legacyMongoId: true } });
  const companyMap = new Map(companies.map((c) => [c.legacyMongoId, c.id]));

  // ── Accounts (pass 1: rows) ───────────────────────────────
  const accounts = await db.collection("accounts").find().toArray();
  const accountMap = new Map(); // legacy _id → new uuid
  const parentOf = new Map(); // legacy _id → parent legacy _id
  for (const a of accounts) {
    const companyId = companyMap.get(id(a.companyId));
    if (!companyId) continue;
    const header = {
      companyId,
      accountCode: a.accountCode ?? id(a._id),
      accountName: a.accountName ?? "Account",
      accountType: a.accountType ?? "asset",
      subType: a.subType ?? null,
      path: a.path ?? "",
      level: a.level ?? 0,
      canPost: a.canPost ?? true,
      systemAccount: a.systemAccount ?? null,
      currency: a.currency ?? "KES",
      cachedBalance: num(a.cachedBalance),
      isActive: a.isActive ?? true,
      taxable: a.taxable ?? false,
      defaultTaxRate: num(a.defaultTaxRate),
      bankDetails: a.bankDetails ? json(a.bankDetails) : null,
      raw: json(a),
    };
    const row = await prisma.account.upsert({
      where: { legacyMongoId: id(a._id) },
      update: header,
      create: { legacyMongoId: id(a._id), ...header },
    });
    accountMap.set(id(a._id), row.id);
    if (a.parentAccount) parentOf.set(id(a._id), id(a.parentAccount));
  }
  // Pass 2: parent links
  for (const [legacy, parentLegacy] of parentOf) {
    const parentNew = accountMap.get(parentLegacy);
    if (parentNew) {
      await prisma.account.update({ where: { id: accountMap.get(legacy) }, data: { parentAccountId: parentNew } });
    }
  }
  console.log(`Accounts: ${accounts.length}`);

  // ── Journal entries + lines ───────────────────────────────
  const entries = await db.collection("journalentries").find().toArray();
  let lineCount = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let unresolvedAccounts = 0;
  for (const je of entries) {
    const companyId = companyMap.get(id(je.companyId));
    if (!companyId) continue;
    const header = {
      companyId,
      entryNumber: je.entryNumber ?? id(je._id),
      entryDate: je.entryDate ?? null,
      entryType: je.entryType ?? "manual",
      description: je.description ?? "",
      status: je.status ?? "draft",
      partyType: je.party?.type ?? null,
      partyRef: id(je.party?.id),
      dueDate: je.dueDate ?? null,
      amountPaid: num(je.amountPaid),
      amountOutstanding: num(je.amountOutstanding),
      isFullyPaid: je.isFullyPaid ?? false,
      fiscalYear: je.fiscalYear ?? null,
      fiscalMonth: je.fiscalMonth ?? null,
      raw: json(je),
    };
    const row = await prisma.journalEntry.upsert({
      where: { legacyMongoId: id(je._id) },
      update: header,
      create: { legacyMongoId: id(je._id), ...header },
    });
    await prisma.journalLine.deleteMany({ where: { journalEntryId: row.id } });
    const lines = je.lines ?? [];
    if (lines.length) {
      await prisma.journalLine.createMany({
        data: lines.map((ln, i) => {
          const legacyAcc = id(ln.accountId);
          const resolved = legacyAcc ? accountMap.get(legacyAcc) ?? null : null;
          if (legacyAcc && !resolved) unresolvedAccounts++;
          totalDebit += num(ln.debit);
          totalCredit += num(ln.credit);
          return {
            legacyKey: `${id(je._id)}#${i}`,
            journalEntryId: row.id,
            lineNumber: i + 1,
            accountLegacyId: legacyAcc,
            accountId: resolved,
            accountType: ln.accountType ?? null,
            debit: num(ln.debit),
            credit: num(ln.credit),
            description: ln.description ?? null,
          };
        }),
      });
      lineCount += lines.length;
    }
  }
  console.log(`Journal entries: ${entries.length} (lines: ${lineCount})`);
  console.log(
    `Double-entry check — debits: ${totalDebit.toFixed(2)}  credits: ${totalCredit.toFixed(2)}  ` +
      `(diff ${(totalDebit - totalCredit).toFixed(2)})`,
  );
  if (unresolvedAccounts) {
    console.log(`⚠ ${unresolvedAccounts} journal line(s) referenced an account not found in Postgres (kept as accountLegacyId).`);
  }
  console.log("\n✅ Finance slice migrated.");
}

main()
  .catch((e) => {
    console.error("\n❌ Finance migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongo.close();
    await prisma.$disconnect();
  });
