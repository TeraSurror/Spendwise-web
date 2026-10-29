// Usage: npm run import -- <file.csv> [more.csv ...]
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/client";
import { importFile } from "../src/import/pipeline";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: npm run import -- <file.csv> [more.csv ...]");
  process.exit(1);
}

const db = getDb();
let failed = 0;
for (const file of files) {
  const outcome = importFile(db, { fileName: path.basename(file), content: fs.readFileSync(file, "utf8") });
  const extra = outcome.transfersMatched ? ` (${outcome.transfersMatched} transfers matched)` : "";
  console.log(`[${outcome.status}] ${outcome.message}${extra}`);
  if (outcome.status === "error") failed++;
}
process.exit(failed ? 2 : 0);
