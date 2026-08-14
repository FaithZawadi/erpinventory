import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { okResponse } from "@/lib/integrations/utils/envelope";
import { Errors } from "@/lib/integrations/utils/errors";
import dbConnect from "@/app/config/dbConnect";
import Invoice from "@/app/models/invoice";

// GET /api/v1/invoices/{id}
export async function GET(request, { params }) {
  const ctx = await apiKeyAuth(request, { requireScope: "invoices:read" });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  await dbConnect();

  const doc = await Invoice.findOne({ _id: id, companyId: ctx.companyId }).lean().catch(() => null);
  if (!doc) return Errors.notFound("Invoice");
  return okResponse(doc);
}
