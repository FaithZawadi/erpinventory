import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/integrations/openapi";

// GET /api/v1/openapi — public OpenAPI 3.0 document for client generation.
// No auth: it describes the API surface, not any tenant data.
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
