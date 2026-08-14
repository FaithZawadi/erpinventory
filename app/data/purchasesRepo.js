// Data-access layer for Purchases (purchase orders / bills) — same seam as
// productRepo/salesRepo. DATA_BACKEND=mongo (default) → Mongoose;
// DATA_BACKEND=postgres → Prisma.

const BACKEND = process.env.DATA_BACKEND ?? "mongo";

export async function listPurchaseOrders({ companyId, limit = 50 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.purchaseOrder.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { poDate: "desc" },
      include: { lines: true },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: PurchaseOrder } = await import("@/app/models/purchaseOrder");
  await dbConnect();
  return PurchaseOrder.find(companyId ? { companyId } : {})
    .sort({ poDate: -1 })
    .limit(limit)
    .lean();
}

export async function listBills({ companyId, limit = 50 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.bill.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { billDate: "desc" },
      include: { lines: true },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Bill } = await import("@/app/models/bill");
  await dbConnect();
  return Bill.find(companyId ? { companyId } : {})
    .sort({ billDate: -1 })
    .limit(limit)
    .lean();
}

export async function countBills({ companyId } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.bill.count({ where: companyId ? { companyId } : {} });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Bill } = await import("@/app/models/bill");
  await dbConnect();
  return Bill.countDocuments(companyId ? { companyId } : {});
}

export function activeBackend() {
  return BACKEND;
}
