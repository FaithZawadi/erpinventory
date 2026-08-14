// Data-access layer for Finance (accounts / journal entries) — same seam as the
// other repos. DATA_BACKEND=mongo (default) → Mongoose; postgres → Prisma.

const BACKEND = process.env.DATA_BACKEND ?? "mongo";

export async function listAccounts({ companyId, limit = 500 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.account.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { accountCode: "asc" },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Account } = await import("@/app/models/account");
  await dbConnect();
  return Account.find(companyId ? { companyId } : {})
    .sort({ accountCode: 1 })
    .limit(limit)
    .lean();
}

export async function listJournalEntries({ companyId, limit = 50 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.journalEntry.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { entryDate: "desc" },
      include: { lines: { include: { account: true } } },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: JournalEntry } = await import("@/app/models/JournalEntry");
  await dbConnect();
  return JournalEntry.find(companyId ? { companyId } : {})
    .sort({ entryDate: -1 })
    .limit(limit)
    .lean();
}

export async function countJournalEntries({ companyId } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.journalEntry.count({ where: companyId ? { companyId } : {} });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: JournalEntry } = await import("@/app/models/JournalEntry");
  await dbConnect();
  return JournalEntry.countDocuments(companyId ? { companyId } : {});
}

export function activeBackend() {
  return BACKEND;
}
