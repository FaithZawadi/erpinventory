import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { listResponse, createdResponse } from "@/lib/integrations/utils/envelope";
import { Errors } from "@/lib/integrations/utils/errors";
import dbConnect from "@/app/config/dbConnect";
import Party from "@/app/models/parties";

// GET /api/v1/contacts — customers & suppliers (tenant-scoped).
// ?type=customer|supplier|both  ?q=  ?page=  ?limit=
export async function GET(request) {
  const ctx = await apiKeyAuth(request, { requireScope: "contacts:read" });
  if (!ctx.ok) return ctx.response;
  await dbConnect();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q");

  const filter = { companyId: ctx.companyId };
  if (type) filter.type = type;
  if (q) filter.$or = [{ name: { $regex: q, $options: "i" } }, { email: { $regex: q, $options: "i" } }];

  const [items, total] = await Promise.all([
    Party.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Party.countDocuments(filter),
  ]);

  return listResponse(items, { page, limit, total, pages: Math.ceil(total / limit) });
}

// POST /api/v1/contacts — create a customer/supplier.
export async function POST(request) {
  const ctx = await apiKeyAuth(request, { requireScope: "contacts:write" });
  if (!ctx.ok) return ctx.response;
  await dbConnect();

  let body;
  try {
    body = await request.json();
  } catch {
    return Errors.validationError("Request body must be valid JSON.");
  }
  if (!body?.name) return Errors.validationError("`name` is required.", "name");
  const type = body.type ?? "customer";
  if (!["customer", "supplier", "employee", "both"].includes(type)) {
    return Errors.validationError("`type` must be customer, supplier, employee or both.", "type");
  }

  try {
    const doc = await Party.create({
      companyId: ctx.companyId,
      type,
      name: body.name,
      displayName: body.displayName,
      email: body.email,
      phone: body.phone,
    });
    return createdResponse(doc.toObject());
  } catch (e) {
    if (e?.code === 11000) return Errors.duplicate(body.email ?? body.name);
    return Errors.validationError(e?.message || "Could not create contact.");
  }
}
