// Usage: npm run backup — writes ~/Spendwise/backups/spendwise-YYYY-MM-DD.db now.
import { loadConfig } from "../src/automation/config";
import { backupDb } from "../src/automation/housekeeping";
import { getDb } from "../src/db/client";

const dest = await backupDb(getDb(), loadConfig().keepBackups);
console.log(`Backed up to ${dest}`);
