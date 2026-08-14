// Mint a test API key for the integration gateway, tied to a company, so you
// can exercise /api/v1/* without the company-Admin UI. The key is stored hashed
// (same as the app) and the plaintext is printed ONCE.
//
//   node scripts/mint-api-key.mjs            # key for the demo company (or first company)
//   node scripts/mint-api-key.mjs --clean    # remove test keys minted by this script
//
// Reads MONGODB_URI from .env.local / .env.
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { generateApiKey } from "../lib/integrations/utils/keyUtils.js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not set (checked .env.local and .env).");
  process.exit(1);
}

const CLEAN = process.argv.includes("--clean");
const ALL_SCOPES = [
  "inventory:read", "inventory:write", "contacts:read", "contacts:write",
  "orders:read", "orders:write", "invoices:read", "invoices:write",
  "hr:read", "collection:write", "webhooks:manage",
];

const mongo = new MongoClient(uri);

async function main() {
  await mongo.connect();
  const db = mongo.db();

  if (CLEAN) {
    const res = await db.collection("integrationkeys").deleteMany({ mintedByScript: true });
    console.log(`Removed ${res.deletedCount} test key(s).`);
    return;
  }

  const company =
    (await db.collection("companies").findOne({ demo: true })) ||
    (await db.collection("companies").findOne({}));
  if (!company) {
    console.error("No company found. Seed one first: node scripts/seed-demo-data.mjs");
    process.exit(1);
  }

  const k = generateApiKey("live");
  const now = new Date();
  await db.collection("integrationkeys").insertOne({
    companyId: company._id,
    name: "Local test key",
    keyHash: k.hash,
    keyPreview: k.preview,
    keyPrefix: k.prefix,
    connectorType: "generic",
    scopes: ALL_SCOPES,
    environment: "live",
    isActive: true,
    rateLimit: { requestsPerMinute: 120 },
    mintedByScript: true,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`\nAPI key minted for company: ${company.name} (${company._id})`);
  console.log("\n  " + k.plaintext + "\n");
  console.log("Shown once — copy it now. Scopes: all. Use as:");
  console.log('  curl -H "Authorization: Bearer ' + k.plaintext + '" http://localhost:3000/api/v1/products');
  console.log("\nRemove test keys later with: node scripts/mint-api-key.mjs --clean");
}

main()
  .catch((e) => {
    console.error("\n❌ Mint failed:", e);
    process.exit(1);
  })
  .finally(() => mongo.close());
