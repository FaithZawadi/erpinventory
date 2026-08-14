import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { okResponse } from "@/lib/integrations/utils/envelope";
import { Errors } from "@/lib/integrations/utils/errors";
import dbConnect from "@/app/config/dbConnect";
import Product from "@/app/models/product";

// GET /api/v1/products/{id}
export async function GET(request, { params }) {
  const ctx = await apiKeyAuth(request, { requireScope: "inventory:read" });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  await dbConnect();

  const doc = await Product.findOne({ _id: id, companyId: ctx.companyId }).lean().catch(() => null);
  if (!doc) return Errors.notFound("Product");
  return okResponse(doc);
}

// PATCH /api/v1/products/{id} — partial update of common fields.
export async function PATCH(request, { params }) {
  const ctx = await apiKeyAuth(request, { requireScope: "inventory:write" });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  await dbConnect();

  let body;
  try {
    body = await request.json();
  } catch {
    return Errors.validationError("Request body must be valid JSON.");
  }

  const set = {};
  if (body.name != null) set.name = body.name;
  if (body.description != null) set.description = body.description;
  if (body.category != null) set.category = body.category;
  if (body.unit != null) set.unit = body.unit;
  if (body.reorderLevel != null) set["inventory.reorderLevel"] = Number(body.reorderLevel);
  if (body.costPrice != null) set["costing.costPrice"] = Number(body.costPrice);
  if (Object.keys(set).length === 0) return Errors.validationError("No updatable fields supplied.");

  const doc = await Product.findOneAndUpdate(
    { _id: id, companyId: ctx.companyId },
    { $set: set },
    { new: true },
  ).lean().catch(() => null);
  if (!doc) return Errors.notFound("Product");
  return okResponse(doc);
}
