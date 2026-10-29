import { randomUUID } from "node:crypto";
import type { DB } from "../db/client";
import type { AccountType, Kind } from "../db/schema";

const TRANSFER_KINDS: Kind[] = ["card_payment", "contribution", "withdrawal", "transfer"];
const MAX_GAP_DAYS = 5;

interface Candidate {
  outId: number;
  inId: number;
  outKind: Kind;
  inKind: Kind;
  outType: AccountType;
  inType: AccountType;
  gap: number;
}

const isBank = (t: AccountType) => t === "checking" || t === "savings";

/** What each side becomes once paired, or null when the two account types can't be a transfer. */
function pairKinds(outType: AccountType, inType: AccountType): { out: Kind; in: Kind } | null {
  if (isBank(outType) && inType === "credit_card") return { out: "card_payment", in: "card_payment" };
  // The brokerage side carries the contribution; the bank side is then just a transfer,
  // so the money is counted as invested exactly once.
  if (isBank(outType) && inType === "brokerage") return { out: "transfer", in: "contribution" };
  if (outType === "brokerage" && isBank(inType)) return { out: "withdrawal", in: "transfer" };
  if (isBank(outType) && isBank(inType)) return { out: "transfer", in: "transfer" };
  if (outType === "brokerage" && inType === "brokerage") return { out: "transfer", in: "transfer" };
  return null;
}

/**
 * Pairs money leaving one of your accounts with the same amount arriving in another
 * within a few days (card payments, brokerage deposits, savings transfers), so neither
 * side counts as spending or income. At least one side must already look like a transfer.
 * Returns the number of pairs made.
 */
export function matchTransfers(db: DB): number {
  const sqlite = db.$client;
  const kinds = TRANSFER_KINDS.map((k) => `'${k}'`).join(",");
  const candidates = sqlite.prepare(`
    SELECT o.id AS outId, i.id AS inId, o.kind AS outKind, i.kind AS inKind,
           oa.type AS outType, ia.type AS inType,
           abs(julianday(o.date) - julianday(i.date)) AS gap
    FROM transactions o
    JOIN transactions i ON i.amount_cents = -o.amount_cents AND i.account_id <> o.account_id
    JOIN accounts oa ON oa.id = o.account_id
    JOIN accounts ia ON ia.id = i.account_id
    WHERE o.amount_cents < 0
      AND o.transfer_group_id IS NULL AND i.transfer_group_id IS NULL
      AND o.is_split = 0 AND i.is_split = 0
      AND abs(julianday(o.date) - julianday(i.date)) <= ${MAX_GAP_DAYS}
      AND (o.kind IN (${kinds}) OR i.kind IN (${kinds}))
      AND (o.manual = 0 OR o.kind IN (${kinds}))
      AND (i.manual = 0 OR i.kind IN (${kinds}))
    ORDER BY gap, o.date, o.id, i.id
  `).all() as Candidate[];

  const used = new Set<number>();
  const categoryId = (name: string) =>
    (sqlite.prepare("SELECT id FROM categories WHERE name = ?").get(name) as { id: number } | undefined)?.id ?? null;
  const transfers = categoryId("Transfers");
  const investing = categoryId("Investing");
  const update = sqlite.prepare(
    "UPDATE transactions SET kind = ?, category_id = ?, transfer_group_id = ? WHERE id = ?",
  );

  let pairs = 0;
  sqlite.transaction(() => {
    for (const c of candidates) {
      if (used.has(c.outId) || used.has(c.inId)) continue;
      const result = pairKinds(c.outType, c.inType);
      if (!result) continue;
      const group = randomUUID();
      const cat = (k: Kind) => (k === "contribution" || k === "withdrawal" ? investing : transfers);
      update.run(result.out, cat(result.out), group, c.outId);
      update.run(result.in, cat(result.in), group, c.inId);
      used.add(c.outId).add(c.inId);
      pairs++;
    }
  })();
  return pairs;
}
