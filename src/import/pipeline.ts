import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { accounts, categories, imports, presets, rules, transactions, type Account } from "../db/schema";
import { classify, sortRules } from "./classify";
import { findTable, readCsv } from "./csv";
import { dedupeKey, selectNew, sha256 } from "./dedupe";
import { cleanMerchant } from "./normalize";
import { BUILT_IN_PRESETS, customPreset, type CustomPresetConfig } from "./presets";
import { matchTransfers } from "./transfers";
import type { ParsedRow, Preset, Table } from "./types";

export type ImportStatus = "imported" | "duplicate_file" | "unrecognized" | "needs_account" | "error";

export interface ImportInput {
  fileName: string;
  content: string;
  /** Put every row in this account (used when resolving an ambiguous file from the UI). */
  accountId?: number;
  /** Skip detection and use this preset. */
  presetId?: string;
  /** Re-run an earlier import record (one left unrecognized or waiting for an account). */
  importId?: number;
}

export interface AccountSummary {
  accountId: number;
  accountName: string;
  inserted: number;
  duplicates: number;
}

export interface ImportOutcome {
  status: ImportStatus;
  importId: number;
  presetId: string | null;
  message: string;
  inserted: number;
  duplicates: number;
  accounts: AccountSummary[];
  transfersMatched: number;
}

export function allPresets(db: DB): Preset[] {
  const custom = db.select().from(presets).all().map((p) => customPreset(p.id, JSON.parse(p.config) as CustomPresetConfig));
  // Saved mappings are exact header matches, so they go before the built-ins.
  return [...custom, ...BUILT_IN_PRESETS];
}

export function detectPreset(db: DB, content: string, presetId?: string): { preset: Preset; table: Table } | null {
  const cells = readCsv(content);
  for (const preset of allPresets(db)) {
    if (presetId && preset.id !== presetId) continue;
    const table = findTable(cells, preset.requiredHeaders);
    if (table) return { preset, table };
  }
  return null;
}

const TYPE_LABEL: Record<Account["type"], string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Card",
  brokerage: "Brokerage",
};

/**
 * Works out which account a group of rows belongs to, creating it when the file makes
 * that unambiguous. Returns null only when you already have several accounts for this
 * format and nothing in the file says which one.
 */
export function resolveAccount(db: DB, preset: Preset, hint: string | null, fileName: string): Account | null {
  const create = (last4: string | null) =>
    db.insert(accounts).values({
      name: `${preset.institution} ${TYPE_LABEL[preset.accountType]}${last4 ? ` ••${last4}` : ""}`,
      institution: preset.institution,
      type: preset.accountType,
      last4,
      presetId: preset.id,
    }).returning().get();

  const last4 = hint ?? preset.last4FromFileName?.(fileName) ?? null;
  if (last4) {
    const existing = db.select().from(accounts)
      .where(and(eq(accounts.institution, preset.institution), eq(accounts.last4, last4), eq(accounts.type, preset.accountType)))
      .get();
    return existing ?? create(last4);
  }

  const forPreset = db.select().from(accounts).where(eq(accounts.presetId, preset.id)).all();
  const byFileName = forPreset.filter((a) => a.last4 && fileName.includes(a.last4));
  if (byFileName.length === 1) return byFileName[0];
  if (forPreset.length === 1) return forPreset[0];
  if (forPreset.length === 0) return create(null);
  return null;
}

/** Imports one CSV export end to end. Never throws for bad files; the outcome says what happened. */
export function importFile(db: DB, input: ImportInput): ImportOutcome {
  const fileSha = sha256(input.content);
  const base = { inserted: 0, duplicates: 0, accounts: [] as AccountSummary[], transfersMatched: 0 };

  const record = (values: Partial<typeof imports.$inferInsert> & { status: ImportStatus }) => {
    const row = { fileName: input.fileName, fileSha256: fileSha, ...values };
    if (input.importId) {
      db.update(imports).set(row).where(eq(imports.id, input.importId)).run();
      return input.importId;
    }
    return db.insert(imports).values(row).returning({ id: imports.id }).get().id;
  };

  const already = db.select({ id: imports.id }).from(imports)
    .where(and(eq(imports.fileSha256, fileSha), eq(imports.status, "imported"))).get();
  if (already && !input.importId) {
    const importId = record({ status: "duplicate_file" });
    return { ...base, status: "duplicate_file", importId, presetId: null, message: `${input.fileName} was already imported` };
  }

  try {
    const detected = detectPreset(db, input.content, input.presetId);
    if (!detected) {
      const importId = record({ status: "unrecognized", content: input.content, error: "No known export format matched this file's headers" });
      return { ...base, status: "unrecognized", importId, presetId: null, message: `Couldn't recognize ${input.fileName}. Map its columns on the Imports page.` };
    }
    const { preset, table } = detected;
    const parsed = preset.parse(table);
    if (parsed.length === 0) {
      const importId = record({ status: "error", presetId: preset.id, content: input.content, error: "The file has no transactions" });
      return { ...base, status: "error", importId, presetId: preset.id, message: `${input.fileName} has no transactions` };
    }

    // Group rows by the account they belong to.
    const groups = new Map<number, { account: Account; rows: ParsedRow[] }>();
    for (const row of parsed) {
      const account = input.accountId
        ? db.select().from(accounts).where(eq(accounts.id, input.accountId)).get() ?? null
        : resolveAccount(db, preset, row.accountHint ?? null, input.fileName);
      if (!account) {
        const importId = record({ status: "needs_account", presetId: preset.id, content: input.content, rowsTotal: parsed.length, error: `Choose which ${preset.label} account this file is for` });
        return { ...base, status: "needs_account", importId, presetId: preset.id, message: `Choose which ${preset.label} account ${input.fileName} belongs to on the Imports page.` };
      }
      if (!groups.has(account.id)) groups.set(account.id, { account, rows: [] });
      groups.get(account.id)!.rows.push(row);
    }

    const ruleList = sortRules(db.select().from(rules).all());
    const categoryIds = new Map(db.select().from(categories).all().map((c) => [c.name, c.id]));

    const outcome = db.transaction((tx) => {
      const importId = record({ status: "imported", presetId: preset.id, content: input.content, rowsTotal: parsed.length, accountId: groups.size === 1 ? [...groups.keys()][0] : null, error: null });
      const summaries: AccountSummary[] = [];
      for (const { account, rows } of groups.values()) {
        const keyed = rows.map((r) => ({ ...r, key: dedupeKey(account.id, r.date, r.amountCents, r.description) }));
        const keys = [...new Set(keyed.map((r) => r.key))];
        const existing = new Map<string, number>();
        for (let i = 0; i < keys.length; i += 500) {
          const counts = tx.select({ key: transactions.dedupeKey, n: sql<number>`count(*)` }).from(transactions)
            .where(inArray(transactions.dedupeKey, keys.slice(i, i + 500)))
            .groupBy(transactions.dedupeKey).all();
          for (const c of counts) existing.set(c.key!, c.n);
        }
        const { fresh, duplicates } = selectNew(keyed, existing);
        for (const r of fresh) {
          const merchant = cleanMerchant(r.description);
          const { kind, categoryId } = classify(
            { description: r.description, merchant, amountCents: r.amountCents, bankCategory: r.bankCategory, kindHint: r.kindHint },
            { rules: ruleList, categoryIds, accountId: account.id, accountType: account.type },
          );
          tx.insert(transactions).values({
            accountId: account.id,
            date: r.date,
            amountCents: r.amountCents,
            descriptionRaw: r.description,
            merchant,
            categoryId,
            kind,
            bankCategory: r.bankCategory ?? null,
            dedupeKey: r.key,
            importId,
          }).run();
        }
        summaries.push({ accountId: account.id, accountName: account.name, inserted: fresh.length, duplicates });
      }
      const inserted = summaries.reduce((s, a) => s + a.inserted, 0);
      const duplicates = summaries.reduce((s, a) => s + a.duplicates, 0);
      tx.update(imports).set({ rowsInserted: inserted, rowsDuplicate: duplicates }).where(eq(imports.id, importId)).run();
      return { importId, summaries, inserted, duplicates };
    });

    const transfersMatched = matchTransfers(db);
    const parts = outcome.summaries.map((s) => `${s.accountName}: ${s.inserted} new, ${s.duplicates} duplicate${s.duplicates === 1 ? "" : "s"}`);
    return {
      status: "imported",
      importId: outcome.importId,
      presetId: preset.id,
      message: parts.join("; "),
      inserted: outcome.inserted,
      duplicates: outcome.duplicates,
      accounts: outcome.summaries,
      transfersMatched,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const importId = record({ status: "error", content: input.content, error: message });
    return { ...base, status: "error", importId, presetId: null, message: `Failed to import ${input.fileName}: ${message}` };
  }
}

/** Re-applies rules to every transaction you haven't edited by hand. Returns rows changed. */
export function reapplyRules(db: DB): number {
  const ruleList = sortRules(db.select().from(rules).all());
  const categoryIds = new Map(db.select().from(categories).all().map((c) => [c.name, c.id]));
  const accountTypes = new Map(db.select().from(accounts).all().map((a) => [a.id, a.type]));
  const rows = db.select().from(transactions)
    .where(and(eq(transactions.manual, false), sql`${transactions.transferGroupId} IS NULL`, sql`${transactions.parentId} IS NULL`)).all();
  let changed = 0;
  db.transaction((tx) => {
    for (const t of rows) {
      const accountType = accountTypes.get(t.accountId);
      if (!accountType) continue;
      // Brokerage rows keep the kind their file gave them; only categories and bank rows are re-derived.
      const kindHint = accountType === "brokerage" || t.kind === "card_payment" && accountType === "credit_card" ? t.kind : null;
      const { kind, categoryId } = classify(
        { description: t.descriptionRaw, merchant: t.merchant, amountCents: t.amountCents, bankCategory: t.bankCategory, kindHint },
        { rules: ruleList, categoryIds, accountId: t.accountId, accountType },
      );
      if (kind !== t.kind || categoryId !== t.categoryId) {
        tx.update(transactions).set({ kind, categoryId }).where(eq(transactions.id, t.id)).run();
        changed++;
      }
    }
  });
  matchTransfers(db);
  return changed;
}
