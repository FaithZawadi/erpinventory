import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { okResponse } from "@/lib/integrations/utils/envelope";
import { Errors } from "@/lib/integrations/utils/errors";
import dbConnect from "@/app/config/dbConnect";
import Party from "@/app/models/parties";

// GET /api/v1/contacts/{id}
export async function GET(request, { params }) {
  const ctx = await apiKeyAuth(request, { requireScope: "contacts:read" });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  await dbConnect();

  const doc = await Party.findOne({ _id: id, companyId: ctx.companyId }).lean().catch(() => null);
  if (!doc) return Errors.notFound("Contact");
  return okResponse(doc);
}
