import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { meta } from "../db/schema";
import { monthOf, todayIso } from "../lib/dates";
import { paths } from "../lib/paths";
import { STALE_AFTER_DAYS, staleAccounts } from "../lib/queries";
import { notify } from "./notify";

const getMeta = (db: DB, key: string) => db.select().from(meta).where(eq(meta.key, key)).get()?.value ?? null;
const setMeta = (db: DB, key: string, value: string) =>
  db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();

/** Writes a consistent copy of the database to backups/ and keeps the newest `keep` copies. */
export async function backupDb(db: DB, keep = 30, today = todayIso()): Promise<string> {
  fs.mkdirSync(paths.backups, { recursive: true });
  const dest = path.join(paths.backups, `spendwise-${today}.db`);
  await db.$client.backup(dest);
  const old = fs.readdirSync(paths.backups).filter((f) => /^spendwise-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.unlinkSync(path.join(paths.backups, f));
  return dest;
}

/** Runs the once-a-day jobs that are due: the nightly backup and the monthly "time to export" reminder. */
export async function runHousekeeping(db: DB, opts: { keepBackups: number; today?: string }): Promise<string[]> {
  const today = opts.today ?? todayIso();
  const done: string[] = [];
  if (getMeta(db, "last_backup") !== today) {
    const dest = await backupDb(db, opts.keepBackups, today);
    setMeta(db, "last_backup", today);
    done.push(`backup ${dest}`);
  }
  const month = monthOf(today);
  if (getMeta(db, "stale_reminder") !== month) {
    const stale = staleAccounts(db, today);
    if (stale.length) {
      notify("Spendwise: time to export", `${stale.map((a) => a.name).join(", ")} ${stale.length === 1 ? "has" : "have"} no new transactions in ${STALE_AFTER_DAYS}+ days.`);
      done.push(`stale reminder for ${stale.length} account(s)`);
    }
    setMeta(db, "stale_reminder", month);
  }
  return done;
}
