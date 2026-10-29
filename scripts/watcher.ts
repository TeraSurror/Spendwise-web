// Watches ~/Spendwise/inbox (and optionally ~/Downloads) and imports CSV exports as they arrive.
// Also runs the nightly backup and the monthly "time to export" reminder.
import path from "node:path";
import chokidar from "chokidar";
import { loadConfig, downloadsDir } from "../src/automation/config";
import { ensureDirs, isCsv, processFile } from "../src/automation/inbox";
import { runHousekeeping } from "../src/automation/housekeeping";
import { notify } from "../src/automation/notify";
import { getDb } from "../src/db/client";
import { paths } from "../src/lib/paths";

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

ensureDirs();
const db = getDb();
const config = loadConfig();

function handle(file: string, source: "inbox" | "downloads") {
  if (!isCsv(file)) return;
  try {
    const outcome = processFile(db, file, source);
    if (!outcome) return; // a Downloads file that isn't a bank export
    log(`[${outcome.status}] ${path.basename(file)}: ${outcome.message}`);
    if (outcome.status === "imported") {
      notify("Spendwise", outcome.message + (outcome.transfersMatched ? ` · ${outcome.transfersMatched} transfer(s) matched` : ""));
    } else if (outcome.status !== "duplicate_file") {
      notify("Spendwise needs a hand", outcome.message);
    }
  } catch (err) {
    log(`[error] ${file}:`, err);
    notify("Spendwise import failed", `${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const watchOpts = { depth: 0, awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 } };

// Files already sitting in the inbox are imported at startup.
chokidar.watch(paths.inbox, { ...watchOpts, ignoreInitial: false })
  .on("add", (file) => handle(file, "inbox"))
  .on("error", (err) => log("[watch error]", err));
log(`Watching ${paths.inbox}`);

const extra = [...(config.watchDownloads ? [downloadsDir()] : []), ...config.extraWatchDirs];
if (extra.length) {
  // Existing downloads are left alone; only new ones are considered.
  chokidar.watch(extra, { ...watchOpts, ignoreInitial: true })
    .on("add", (file) => handle(file, "downloads"))
    .on("error", (err) => log("[watch error]", err));
  log(`Also watching for recognized exports in ${extra.join(", ")}`);
}

async function housekeeping() {
  try {
    for (const line of await runHousekeeping(db, { keepBackups: config.keepBackups })) log(line);
  } catch (err) {
    log("[housekeeping error]", err);
  }
}
void housekeeping();
setInterval(housekeeping, 60 * 60 * 1000);
