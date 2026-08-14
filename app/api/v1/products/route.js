import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { listResponse, createdResponse } from "@/lib/integrations/utils/envelope";
import { Errors } from "@/lib/integrations/utils/errors";
import dbConnect from "@/app/config/dbConnect";
import Product from "@/app/models/product";

// GET /api/v1/products — list products (tenant-scoped). ?q= &page= &limit=
export async function GET(request) {
  const ctx = await apiKeyAuth(request, { requireScope: "inventory:read" });
  if (!ctx.ok) return ctx.response;
  await dbConnect();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const q = url.searchParams.get("q");

  const filter = { companyId: ctx.companyId };
  if (q) filter.$or = [{ name: { $regex: q, $options: "i" } }, { SKU: { $regex: q, $options: "i" } }];

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  return listResponse(items, { page, limit, total, pages: Math.ceil(total / limit) });
}

// POST /api/v1/products — create a product (tenant-scoped).
export async function POST(request) {
  const ctx = await apiKeyAuth(request, { requireScope: "inventory:write" });
  if (!ctx.ok) return ctx.response;
  await dbConnect();

  let body;
  try {
    body = await request.json();
  } catch {
    return Errors.validationError("Request body must be valid JSON.");
  }
  if (!body?.name) return Errors.validationError("`name` is required.", "name");
  if (!body?.sku && !body?.SKU) return Errors.validationError("`sku` is required.", "sku");

  try {
    const doc = await Product.create({
      companyId: ctx.companyId,
      name: body.name,
      SKU: body.sku ?? body.SKU,
      type: body.type ?? "Inventory Item",
      unit: body.unit ?? "pcs",
      description: body.description,
      category: body.category,
      inventory: {
        quantityOnHand: Number(body.quantityOnHand ?? 0),
        reorderLevel: Number(body.reorderLevel ?? 0),
      },
      costing: { costPrice: Number(body.costPrice ?? 0) },
    });
    return createdResponse(doc.toObject());
  } catch (e) {
    if (e?.code === 11000) return Errors.duplicate(body.sku ?? body.SKU);
    return Errors.validationError(e?.message || "Could not create product.");
  }
}
