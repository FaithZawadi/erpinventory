// Data-access layer for Sales (invoices/quotes) — same seam as productRepo.
// DATA_BACKEND=mongo (default) → Mongoose; DATA_BACKEND=postgres → Prisma.
// This is what a live page/action calls so its storage engine can be flipped
// per-module without touching the caller.

const BACKEND = process.env.DATA_BACKEND ?? "mongo";

export async function listInvoices({ companyId, limit = 50 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.invoice.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { invoiceDate: "desc" },
      include: { lines: true },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Invoice } = await import("@/app/models/invoice");
  await dbConnect();
  return Invoice.find(companyId ? { companyId } : {})
    .sort({ invoiceDate: -1 })
    .limit(limit)
    .lean();
}

export async function countInvoices({ companyId } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.invoice.count({ where: companyId ? { companyId } : {} });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Invoice } = await import("@/app/models/invoice");
  await dbConnect();
  return Invoice.countDocuments(companyId ? { companyId } : {});
}

export function activeBackend() {
  return BACKEND;
}
