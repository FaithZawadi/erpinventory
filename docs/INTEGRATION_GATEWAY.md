# Integration Gateway (`/api/v1`)

erpinventory exposes a versioned, API-key-authenticated REST gateway that any
external system — **C#, Python, or anything that speaks HTTP** — can call. It is
transport-only (REST/JSON), so it is **database-agnostic** and unaffected by the
planned Postgres migration.

## Why this is the integration surface

- API keys are issued per company (`IntegrationKey`), stored **hashed**, scoped,
  rate-limited (60 req/min default), and tagged by `connectorType`
  (`weighbridge`, `coffee_coop`, `logistics`, `miller`, `generic`).
- Auth + rate limiting live in `lib/integrations/middleware/apiKeyAuth.js`; every
  route just calls `apiKeyAuth(request)`.
- Responses use a consistent envelope (`lib/integrations/utils/envelope.js`).

## Authentication

Send the key as a bearer token:

```
Authorization: Bearer qls_live_k_xxxxxxxxxxxxxxxx
```

Sensitive endpoints may additionally require an HMAC signature:

```
x-timestamp: 1699999999
x-signature: <hex HMAC-SHA256 of `${timestamp}.${rawBody}` using the key secret>
```

Smoke-test connectivity (no side effects):

```
GET /api/v1/auth/token-info
```

Returns the key name, `connectorType`, `scopes`, `environment`, and remaining
rate limit — the fastest way for an integrator to confirm their key works.

## Current endpoints

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET  | `/api/v1/auth/token-info` | — | Verify key, inspect scopes & rate limit |
| GET  | `/api/v1/openapi` | — (public) | OpenAPI 3.0 spec for client generation |
| GET/POST | `/api/v1/products` | `inventory:read` / `inventory:write` | List / create products |
| GET/PATCH | `/api/v1/products/{id}` | `inventory:read` / `inventory:write` | Get / update a product |
| GET/POST | `/api/v1/contacts` | `contacts:read` / `contacts:write` | List / create customers & suppliers |
| GET  | `/api/v1/contacts/{id}` | `contacts:read` | Get a contact |
| GET  | `/api/v1/invoices` | `invoices:read` | List invoices (read-only) |
| GET  | `/api/v1/invoices/{id}` | `invoices:read` | Get an invoice |
| GET  | `/api/v1/purchase-orders` | `orders:read` | List purchase orders (read-only) |
| POST | `/api/v1/weighbridge/tickets` | `collection:write` | Ingest a weighbridge ticket |
| GET  | `/api/v1/weighbridge/tickets/{id}` | `collection:write` | Fetch a ticket |
| POST | `/api/v1/coffee-coop/intake` | `collection:write` | Post a coffee-coop intake entry |
| GET/POST | `/api/v1/webhooks` | `webhooks:manage` | List / register webhook subscriptions |
| ...  | `/api/v1/webhooks/{id}` | `webhooks:manage` | Manage a subscription |

Every endpoint is **tenant-scoped** to the API key's company. List endpoints accept
`?page=`, `?limit=` (max 200) and `?q=` (search). Invoice and purchase-order
*writes* are intentionally not exposed — issuing them has journal/stock side
effects that must run through the in-app flow.

### Generate a typed client from the spec

The gateway serves its own OpenAPI document at `GET /api/v1/openapi`:

```
# Python
openapi-python-client generate --url https://your-host/api/v1/openapi

# C# (NSwag)
nswag openapi2csclient /input:https://your-host/api/v1/openapi /output:QaliSuiteClient.cs
```

### Adding a new endpoint (the pattern)

```js
// app/api/v1/<connector>/<resource>/route.js
import { apiKeyAuth } from "@/lib/integrations/middleware/apiKeyAuth";
import { okResponse } from "@/lib/integrations/utils/envelope";

export async function POST(request) {
  const ctx = await apiKeyAuth(request, { requireScope: "resource:write" });
  if (!ctx.ok) return ctx.response;

  const body = await request.json();
  // ...persist via your data-access layer using ctx.companyId (tenant)...
  return okResponse({ id: "..." }, { status: 201 });
}
```

Keep handlers thin: authenticate → validate (zod) → call a repository/action →
return the envelope. Because tenancy comes from `ctx.companyId`, external callers
can never cross tenants.

## Client examples

### C# (`HttpClient`)

```csharp
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;

var http = new HttpClient { BaseAddress = new Uri("https://your-host/api/v1/") };
http.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", "qls_live_k_xxxxxxxxxxxxxxxx");

// Connectivity check
var info = await http.GetAsync("auth/token-info");
Console.WriteLine(await info.Content.ReadAsStringAsync());

// Post a weighbridge ticket
var payload = new StringContent(
    """{ "vehicleReg": "KDG 884B", "grossKg": 14200, "tareKg": 5200 }""",
    Encoding.UTF8, "application/json");
var res = await http.PostAsync("weighbridge/tickets", payload);
Console.WriteLine((int)res.StatusCode + " " + await res.Content.ReadAsStringAsync());
```

### Python (`requests`)

```python
import requests

BASE = "https://your-host/api/v1"
HEADERS = {"Authorization": "Bearer qls_live_k_xxxxxxxxxxxxxxxx"}

# Connectivity check
print(requests.get(f"{BASE}/auth/token-info", headers=HEADERS).json())

# Post a coffee-coop intake
resp = requests.post(
    f"{BASE}/coffee-coop/intake",
    headers=HEADERS,
    json={"farmerId": "F-1042", "weightKg": 320, "grade": "AA"},
)
print(resp.status_code, resp.json())
```

### HMAC signing (Python, for signed endpoints)

```python
import time, hmac, hashlib, json, requests

secret = b"<key-secret>"
body = json.dumps({"weightKg": 320}, separators=(",", ":"))
ts = str(int(time.time()))
sig = hmac.new(secret, f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()

requests.post(f"{BASE}/coffee-coop/intake", data=body, headers={
    "Authorization": "Bearer qls_live_k_xxxx",
    "Content-Type": "application/json",
    "x-timestamp": ts,
    "x-signature": sig,
})
```

## Issuing keys

Admins issue keys in **Integrations → API Keys** (backed by `integration-actions`
+ the `IntegrationKey` model). The plaintext key is shown **once** at creation;
only the SHA-256 hash is stored.

## Roadmap to a fuller gateway

The foundation is solid. To make it a first-class C#/Python integration surface:

1. **Publish an OpenAPI 3 spec** (`docs/openapi.v1.yaml`) so integrators can
   generate typed clients (C# via NSwag/Kiota, Python via `openapi-python-client`).
2. **Broaden coverage** beyond connectors — read/write endpoints for products,
   stock movements, invoices, purchase orders (scoped).
3. **Move rate limiting to Redis** (the current store is in-memory per instance).
4. **Outbound webhooks** for domain events (`invoice.created`, `stock.low`) so
   external systems react in real time — the `webhookSubscription` model already
   exists.

Tell me which endpoints your C#/Python services need and I'll add them following
the pattern above, plus generate the OpenAPI spec.
