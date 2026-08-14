// Data-access layer for HR (employees / payroll) — same seam as the other
// repos. DATA_BACKEND=mongo (default) → Mongoose; postgres → Prisma.

const BACKEND = process.env.DATA_BACKEND ?? "mongo";

export async function listEmployees({ companyId, limit = 200 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.employeeProfile.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: { employeeNumber: "asc" },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: EmployeeProfile } = await import("@/app/models/employeeProfile");
  await dbConnect();
  return EmployeeProfile.find(companyId ? { companyId } : {})
    .limit(limit)
    .lean();
}

export async function listPayrollRuns({ companyId, limit = 50 } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.payrollRun.findMany({
      where: companyId ? { companyId } : {},
      take: limit,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      include: { entries: true },
    });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: PayrollRun } = await import("@/app/models/payrollRun");
  await dbConnect();
  return PayrollRun.find(companyId ? { companyId } : {})
    .sort({ "period.year": -1, "period.month": -1 })
    .limit(limit)
    .lean();
}

export async function countEmployees({ companyId } = {}) {
  if (BACKEND === "postgres") {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma.employeeProfile.count({ where: companyId ? { companyId } : {} });
  }
  const { default: dbConnect } = await import("@/app/config/dbConnect");
  const { default: EmployeeProfile } = await import("@/app/models/employeeProfile");
  await dbConnect();
  return EmployeeProfile.countDocuments(companyId ? { companyId } : {});
}

export function activeBackend() {
  return BACKEND;
}
