// One-time index sync.
//
// erpinventory's dbConnect builds/syncs every schema index on boot unless
// MONGO_AUTOINDEX=false. With ~60 models and ~250 indexes that is a real
// boot-time cost. Best practice for production: run this script once after a
// deploy (or after adding indexes), then set MONGO_AUTOINDEX=false so runtime
// boots skip the index-build storm.
//
//   node scripts/sync-indexes.mjs
//
// Reads MONGODB_URI from .env.local / .env.

import mongoose from "mongoose";
import dotenv from "dotenv";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not set (checked .env.local and .env).");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(here, "..", "app", "models");

await mongoose.connect(uri);
console.log("Connected — registering models…");

for (const file of readdirSync(modelsDir).filter((f) => f.endsWith(".js"))) {
  try {
    await import(pathToFileURL(join(modelsDir, file)).href);
  } catch (e) {
    console.warn(`  skip ${file}: ${e.message}`);
  }
}

const names = Object.keys(mongoose.models);
console.log(`Syncing indexes for ${names.length} models…`);
let ok = 0;
for (const name of names) {
  try {
    await mongoose.models[name].syncIndexes();
    ok++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    console.warn(`  ✗ ${name}: ${e.message}`);
  }
}

console.log(`\nDone — ${ok}/${names.length} models synced.`);
console.log("You can now run the app with MONGO_AUTOINDEX=false.");
await mongoose.disconnect();
process.exit(0);
