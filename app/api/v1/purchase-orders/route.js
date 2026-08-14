import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { listResponse } from "@/lib/integrations/utils/envelope";
import dbConnect from "@/app/config/dbConnect";
import PurchaseOrder from "@/app/models/purchaseOrder";

// GET /api/v1/purchase-orders — list POs (tenant-scoped, read-only).
// ?status=  ?page=  ?limit=
export async function GET(request) {
  const ctx = await apiKeyAuth(request, { requireScope: "orders:read" });
  if (!ctx.ok) return ctx.response;
  await dbConnect();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const status = url.searchParams.get("status");

  const filter = { companyId: ctx.companyId };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ poDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);

  return listResponse(items, { page, limit, total, pages: Math.ceil(total / limit) });
}
