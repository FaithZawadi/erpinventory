import { auth } from "@/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/app/config/dbConnect";

import Company from "@/app/models/Company";
import User from "@/app/models/user";
import Category from "@/app/models/category";
import Product from "@/app/models/product";
import { StockMovement } from "@/app/models/stockmovement";
import Invoice from "@/app/models/invoice";
import Quote from "@/app/models/quote";
import PurchaseOrder from "@/app/models/purchaseOrder";
import Bill from "@/app/models/bill";
import Account from "@/app/models/account";
import JournalEntry from "@/app/models/JournalEntry";
import Department from "@/app/models/department";
import EmployeeProfile from "@/app/models/employeeProfile";
import PayrollRun from "@/app/models/payrollRun";
import LeaveRequest from "@/app/models/leaveRequest";

import DbStatusView from "./DbStatusView";

export const metadata = { title: "Database Status | ERP" };

// [label, MongooseModel, prismaDelegateName]
const DEFS = [
  ["Companies", Company, "company"],
  ["Users", User, "user"],
  ["Categories", Category, "category"],
  ["Products", Product, "product"],
  ["Stock movements", StockMovement, "stockMovement"],
  ["Invoices", Invoice, "invoice"],
  ["Quotes", Quote, "quote"],
  ["Purchase orders", PurchaseOrder, "purchaseOrder"],
  ["Bills", Bill, "bill"],
  ["Accounts", Account, "account"],
  ["Journal entries", JournalEntry, "journalEntry"],
  ["Departments", Department, "department"],
  ["Employees", EmployeeProfile, "employeeProfile"],
  ["Payroll runs", PayrollRun, "payrollRun"],
  ["Leave requests", LeaveRequest, "leaveRequest"],
];

export default async function DatabaseStatusPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!["Admin", "SuperAdmin"].includes(role)) redirect("/dashboard");

  await dbConnect();
  const mongoCounts = await Promise.all(
    DEFS.map(([, Model]) => Model.estimatedDocumentCount().catch(() => null)),
  );

  let pgAvailable = true;
  let pgError = null;
  let pgCounts = DEFS.map(() => null);
  try {
    const { default: prisma } = await import("@/lib/prisma");
    pgCounts = await Promise.all(
      DEFS.map(([, , delegate]) => prisma[delegate].count().catch(() => null)),
    );
  } catch (e) {
    pgAvailable = false;
    pgError = e?.message || "Prisma/Postgres unavailable";
  }

  const rows = DEFS.map(([label], i) => ({
    label,
    mongo: mongoCounts[i],
    postgres: pgCounts[i],
  }));

  return (
    <DbStatusView
      rows={rows}
      pgAvailable={pgAvailable}
      pgError={pgError}
      activeBackend={process.env.DATA_BACKEND ?? "mongo"}
    />
  );
}
