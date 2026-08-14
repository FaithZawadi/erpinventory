// OpenAPI 3.0 spec for the /api/v1 integration gateway. Served publicly at
// GET /api/v1/openapi so external teams can generate typed clients:
//   C#:     nswag openapi2csclient / Kiota
//   Python: openapi-python-client generate --url https://<host>/api/v1/openapi
// Keep this in sync when adding endpoints.

const errorEnvelope = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string" },
        field: { type: "string" },
      },
    },
    meta: { type: "object" },
  },
};

const listEnvelope = (itemsRef) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: {
      type: "object",
      properties: {
        items: { type: "array", items: itemsRef },
        pagination: { $ref: "#/components/schemas/Pagination" },
      },
    },
    meta: { type: "object" },
  },
});

const itemEnvelope = (itemsRef) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: itemsRef,
    meta: { type: "object" },
  },
});

const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", default: 1, minimum: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
  { name: "q", in: "query", schema: { type: "string" }, description: "Free-text search" },
];

const jsonBody = (ref) => ({ required: true, content: { "application/json": { schema: ref } } });
const ok = (ref) => ({ description: "OK", content: { "application/json": { schema: ref } } });
const errRef = { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "QaliSuite ERP — Integration API",
    version: "1.0.0",
    description:
      "API-key authenticated REST gateway. Send `Authorization: Bearer <api_key>`. " +
      "All responses use a `{ success, data, meta }` envelope; errors use `{ success, error, meta }`. " +
      "Every resource is scoped to the API key's company (tenant).",
  },
  servers: [{ url: "/api/v1", description: "This host" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Auth" }, { name: "Products" }, { name: "Contacts" },
    { name: "Invoices" }, { name: "Purchase Orders" },
  ],
  paths: {
    "/auth/token-info": {
      get: {
        tags: ["Auth"], summary: "Verify key & inspect scopes/rate limit",
        responses: { 200: ok({ $ref: "#/components/schemas/Envelope" }), 401: errRef },
      },
    },
    "/products": {
      get: {
        tags: ["Products"], summary: "List products", parameters: pageParams,
        security: [{ bearerAuth: [] }],
        responses: { 200: ok(listEnvelope({ $ref: "#/components/schemas/Product" })), 401: errRef, 403: errRef },
        "x-scope": "inventory:read",
      },
      post: {
        tags: ["Products"], summary: "Create product",
        requestBody: jsonBody({ $ref: "#/components/schemas/ProductCreate" }),
        responses: { 201: ok(itemEnvelope({ $ref: "#/components/schemas/Product" })), 422: errRef, 409: errRef },
        "x-scope": "inventory:write",
      },
    },
    "/products/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Products"], summary: "Get product",
        responses: { 200: ok(itemEnvelope({ $ref: "#/components/schemas/Product" })), 404: errRef },
        "x-scope": "inventory:read",
      },
      patch: {
        tags: ["Products"], summary: "Update product (partial)",
        requestBody: jsonBody({ $ref: "#/components/schemas/ProductCreate" }),
        responses: { 200: ok(itemEnvelope({ $ref: "#/components/schemas/Product" })), 404: errRef },
        "x-scope": "inventory:write",
      },
    },
    "/contacts": {
      get: {
        tags: ["Contacts"], summary: "List customers/suppliers",
        parameters: [...pageParams, { name: "type", in: "query", schema: { type: "string", enum: ["customer", "supplier", "employee", "both"] } }],
        responses: { 200: ok(listEnvelope({ $ref: "#/components/schemas/Contact" })), 401: errRef },
        "x-scope": "contacts:read",
      },
      post: {
        tags: ["Contacts"], summary: "Create customer/supplier",
        requestBody: jsonBody({ $ref: "#/components/schemas/ContactCreate" }),
        responses: { 201: ok(itemEnvelope({ $ref: "#/components/schemas/Contact" })), 422: errRef },
        "x-scope": "contacts:write",
      },
    },
    "/contacts/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Contacts"], summary: "Get contact",
        responses: { 200: ok(itemEnvelope({ $ref: "#/components/schemas/Contact" })), 404: errRef },
        "x-scope": "contacts:read",
      },
    },
    "/invoices": {
      get: {
        tags: ["Invoices"], summary: "List invoices (read-only)",
        parameters: [...pageParams, { name: "status", in: "query", schema: { type: "string" } }],
        responses: { 200: ok(listEnvelope({ $ref: "#/components/schemas/Invoice" })), 401: errRef },
        "x-scope": "invoices:read",
      },
    },
    "/invoices/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Invoices"], summary: "Get invoice",
        responses: { 200: ok(itemEnvelope({ $ref: "#/components/schemas/Invoice" })), 404: errRef },
        "x-scope": "invoices:read",
      },
    },
    "/purchase-orders": {
      get: {
        tags: ["Purchase Orders"], summary: "List purchase orders (read-only)",
        parameters: [...pageParams, { name: "status", in: "query", schema: { type: "string" } }],
        responses: { 200: ok(listEnvelope({ $ref: "#/components/schemas/PurchaseOrder" })), 401: errRef },
        "x-scope": "orders:read",
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "API key issued in Integrations → API Keys" },
    },
    schemas: {
      Envelope: { type: "object", properties: { success: { type: "boolean" }, data: {}, meta: { type: "object" } } },
      Error: errorEnvelope,
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" }, limit: { type: "integer" },
          total: { type: "integer" }, pages: { type: "integer" },
        },
      },
      Product: {
        type: "object",
        properties: {
          _id: { type: "string" }, name: { type: "string" }, SKU: { type: "string" },
          type: { type: "string" }, unit: { type: "string" }, category: { type: "string" },
          inventory: { type: "object" }, costing: { type: "object" },
        },
      },
      ProductCreate: {
        type: "object", required: ["name", "sku"],
        properties: {
          name: { type: "string" }, sku: { type: "string" }, type: { type: "string" },
          unit: { type: "string" }, description: { type: "string" }, category: { type: "string" },
          quantityOnHand: { type: "number" }, reorderLevel: { type: "number" }, costPrice: { type: "number" },
        },
      },
      Contact: {
        type: "object",
        properties: {
          _id: { type: "string" }, name: { type: "string" },
          type: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
        },
      },
      ContactCreate: {
        type: "object", required: ["name"],
        properties: {
          name: { type: "string" }, type: { type: "string", enum: ["customer", "supplier", "employee", "both"] },
          displayName: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
        },
      },
      Invoice: {
        type: "object",
        properties: {
          _id: { type: "string" }, invoiceNumber: { type: "string" }, status: { type: "string" },
          customer: { type: "object" }, items: { type: "array", items: { type: "object" } },
          total: { type: "number" },
        },
      },
      PurchaseOrder: {
        type: "object",
        properties: {
          _id: { type: "string" }, poNumber: { type: "string" }, status: { type: "string" },
          supplier: { type: "object" }, items: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
};

export default openApiSpec;
