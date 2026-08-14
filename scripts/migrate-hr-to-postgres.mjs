// ETL: MongoDB → PostgreSQL for the HR / PAYROLL slice — departments, employee
// profiles, payroll runs + per-employee entries, and leave requests. Ordered so
// FKs resolve (departments → profiles → runs → entries → leave). Idempotent.
//
//   node scripts/migrate-hr-to-postgres.mjs
//
// Run after the core ETL and `npx prisma migrate dev --name add_hr`.
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

  // ── Departments (two-pass for the tree) ───────────────────
  const departments = await db.collection("departments").find().toArray();
  const deptMap = new Map();
  const deptParent = new Map();
  for (const d of departments) {
    const companyId = companyMap.get(id(d.companyId));
    if (!companyId) continue;
    const row = await prisma.department.upsert({
      where: { legacyMongoId: id(d._id) },
      update: {},
      create: {
        legacyMongoId: id(d._id),
        companyId,
        code: d.code ?? id(d._id),
        name: d.name ?? "Department",
        description: d.description ?? null,
        isActive: d.isActive ?? true,
        raw: json(d),
      },
    });
    deptMap.set(id(d._id), row.id);
    if (d.parentDepartmentId) deptParent.set(id(d._id), id(d.parentDepartmentId));
  }
  for (const [legacy, parentLegacy] of deptParent) {
    const parentNew = deptMap.get(parentLegacy);
    if (parentNew) await prisma.department.update({ where: { id: deptMap.get(legacy) }, data: { parentDepartmentId: parentNew } });
  }
  console.log(`Departments: ${departments.length}`);

  // ── Employee profiles ─────────────────────────────────────
  const profiles = await db.collection("employeeprofiles").find().toArray();
  const profileMap = new Map();
  for (const e of profiles) {
    const companyId = companyMap.get(id(e.companyId));
    if (!companyId) continue;
    const row = await prisma.employeeProfile.upsert({
      where: { legacyMongoId: id(e._id) },
      update: {},
      create: {
        legacyMongoId: id(e._id),
        companyId,
        employeeNumber: e.employeeNumber ?? null,
        firstName: e.personalInfo?.firstName ?? null,
        lastName: e.personalInfo?.lastName ?? null,
        email: e.personalInfo?.email ?? e.email ?? null,
        partyLegacyId: id(e.partyId),
        userLegacyId: id(e.userId),
        departmentLegacyId: id(e.employmentInfo?.departmentId ?? e.departmentId),
        raw: json(e),
      },
    });
    profileMap.set(id(e._id), row.id);
  }
  console.log(`Employee profiles: ${profiles.length}`);

  // ── Payroll runs ──────────────────────────────────────────
  const runs = await db.collection("payrollruns").find().toArray();
  const runMap = new Map();
  for (const r of runs) {
    const companyId = companyMap.get(id(r.companyId));
    if (!companyId) continue;
    const t = r.totals ?? {};
    const row = await prisma.payrollRun.upsert({
      where: { legacyMongoId: id(r._id) },
      update: {},
      create: {
        legacyMongoId: id(r._id),
        companyId,
        payrollNumber: r.payrollNumber ?? id(r._id),
        periodMonth: r.period?.month ?? null,
        periodYear: r.period?.year ?? null,
        scope: r.scope ?? "all",
        departmentId: r.departmentId ? deptMap.get(id(r.departmentId)) ?? null : null,
        status: r.status ?? "draft",
        currency: r.currency ?? "KES",
        employeeCount: t.employeeCount ?? 0,
        totalGrossPay: num(t.totalGrossPay),
        totalDeductions: num(t.totalDeductions),
        totalNetPay: num(t.totalNetPay),
        totalPAYE: num(t.totalPAYE),
        totalNSSF: num(t.totalNSSF),
        totalSHIF: num(t.totalSHIF),
        totalHousingLevy: num(t.totalHousingLevy),
        raw: json(r),
      },
    });
    runMap.set(id(r._id), row.id);
  }
  console.log(`Payroll runs: ${runs.length}`);

  // ── Payroll entries ───────────────────────────────────────
  const pentries = await db.collection("payrollentries").find().toArray();
  let pe = 0;
  for (const p of pentries) {
    const companyId = companyMap.get(id(p.companyId));
    const payrollRunId = runMap.get(id(p.payrollRunId));
    if (!companyId || !payrollRunId) continue;
    const ded = p.deductions ?? {};
    const earn = p.earnings ?? {};
    await prisma.payrollEntry.upsert({
      where: { legacyMongoId: id(p._id) },
      update: {},
      create: {
        legacyMongoId: id(p._id),
        companyId,
        payrollRunId,
        employeeProfileId: p.profileId ? profileMap.get(id(p.profileId)) ?? null : null,
        profileLegacyId: id(p.profileId),
        partyLegacyId: id(p.partyId),
        periodMonth: p.period?.month ?? null,
        periodYear: p.period?.year ?? null,
        basicSalary: num(earn.basicSalary),
        grossPay: num(earn.grossPay),
        paye: num(ded.paye),
        nssf: num(ded.nssf),
        shif: num(ded.shif),
        housingLevy: num(ded.housingLevy ?? ded.housingLevyEmployee),
        totalDeductions: num(ded.totalDeductions),
        netPay: num(p.netPay ?? p.netpay),
        raw: json(p),
      },
    });
    pe++;
  }
  console.log(`Payroll entries: ${pentries.length} (migrated: ${pe})`);

  // ── Leave requests ────────────────────────────────────────
  const leaves = await db.collection("leaverequests").find().toArray();
  for (const l of leaves) {
    const companyId = companyMap.get(id(l.companyId));
    if (!companyId) continue;
    await prisma.leaveRequest.upsert({
      where: { legacyMongoId: id(l._id) },
      update: {},
      create: {
        legacyMongoId: id(l._id),
        companyId,
        leaveNumber: l.leaveNumber ?? id(l._id),
        employeeName: l.employee?.name ?? null,
        partyLegacyId: id(l.employee?.partyId),
        employeeProfileId: l.employee?.profileId ? profileMap.get(id(l.employee.profileId)) ?? null : null,
        leaveType: l.leaveType ?? null,
        fromDate: l.dates?.from ?? null,
        toDate: l.dates?.to ?? null,
        totalDays: num(l.dates?.totalDays),
        halfDay: l.dates?.halfDay ?? false,
        status: l.status ?? "pending",
        raw: json(l),
      },
    });
  }
  console.log(`Leave requests: ${leaves.length}`);

  console.log("\n✅ HR / Payroll slice migrated.");
}

main()
  .catch((e) => {
    console.error("\n❌ HR migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await mongo.close();
    await prisma.$disconnect();
  });
