// Data-access layer for Products — the seam that lets the app swap storage
// engines without touching callers (per docs/POSTGRES_MIGRATION_PLAN.md).
//
// Backend is chosen by the DATA_BACKEND env var:
//   DATA_BACKEND=mongo     (default) → existing Mongoose path
//   DATA_BACKEND=postgres            → Prisma/Postgres path
//
// This is the template. As each module is hardened, give it a repo like this
// and migrate its server actions/queries to call the repo instead of the model
// directly. Nothing else needs to change to flip a module's backend.

const BACKEND = process.env.DATA_BACKEND ?? "mongo";

export async function listProducts({ companyId, limit = 50 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.product.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { createdAt: "desc" },
    });
  }

  // Mongo (default)
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Product } = await import("@/app/models/product");
  await dbConnect();
  return Product.find(companyId ? { companyId } : {})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function countProducts({ companyId } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.product.count({ where: companyId ? { companyId } : {} });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: Product } = await import("@/app/models/product");
  await dbConnect();
  return Product.countDocuments(companyId ? { companyId } : {});
}

export function activeBackend() {
  return BACKEND;
}
