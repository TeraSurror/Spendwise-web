import { createHash } from "node:crypto";
import { normalizeDescription } from "./normalize";

export function dedupeKey(accountId: number, date: string, amountCents: number, description: string): string {
  return createHash("sha1")
    .update(`${accountId}|${date}|${amountCents}|${normalizeDescription(description)}`)
    .digest("hex");
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Keeps only rows not already stored. Counting occurrences (rather than checking presence)
 * means two identical coffees on the same day both survive, while an overlapping
 * re-export of those same two adds nothing.
 */
export function selectNew<T extends { key: string }>(rows: T[], existing: Map<string, number>): { fresh: T[]; duplicates: number } {
  const seen = new Map<string, number>();
  const fresh: T[] = [];
  for (const row of rows) {
    const n = (seen.get(row.key) ?? 0) + 1;
    seen.set(row.key, n);
    if (n > (existing.get(row.key) ?? 0)) fresh.push(row);
  }
  return { fresh, duplicates: rows.length - fresh.length };
}
