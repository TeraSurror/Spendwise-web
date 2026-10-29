import fs from "node:fs";
import path from "node:path";
import type { DB } from "../db/client";
import { detectPreset, importFile, type ImportOutcome } from "../import/pipeline";
import { monthOf, todayIso } from "../lib/dates";
import { paths } from "../lib/paths";

export const isCsv = (file: string) => /\.(csv|txt)$/i.test(file);

export function ensureDirs() {
  for (const dir of [paths.inbox, paths.processed, paths.failed, paths.backups, paths.logs, path.dirname(paths.db)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Moves (or copies) a file into dir, adding a suffix instead of overwriting. */
function place(file: string, dir: string, copy: boolean): string {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let dest = path.join(dir, path.basename(file));
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(dir, `${base}-${i}${ext}`);
  if (copy) fs.copyFileSync(file, dest);
  else fs.renameSync(file, dest);
  return dest;
}

/**
 * Imports one file from a watched folder.
 * - "inbox": the file is moved to processed/YYYY-MM/ on success, or failed/ when it needs attention
 *   (its contents are kept in the database so the Imports page can finish the job).
 * - "downloads": the file is only touched if its headers match a known format, and is copied, never moved.
 * Returns null when a downloads file was ignored.
 */
export function processFile(db: DB, file: string, source: "inbox" | "downloads"): ImportOutcome | null {
  const content = fs.readFileSync(file, "utf8");
  if (source === "downloads" && !detectPreset(db, content)) return null;
  const outcome = importFile(db, { fileName: path.basename(file), content });
  const ok = outcome.status === "imported" || outcome.status === "duplicate_file";
  if (source === "downloads") {
    if (outcome.status === "imported") place(file, path.join(paths.processed, monthOf(todayIso())), true);
  } else {
    place(file, ok ? path.join(paths.processed, monthOf(todayIso())) : paths.failed, false);
  }
  return outcome;
}
