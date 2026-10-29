"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { ACCOUNT_TYPES, KINDS, accounts, categories, imports, presets, rules, transactions, type AccountType, type Kind } from "@/db/schema";
import { normalizeHeader } from "@/import/csv";
import { allPresets, importFile, reapplyRules, type ImportOutcome } from "@/import/pipeline";
import type { CustomPresetConfig } from "@/import/presets";
import { matchTransfers } from "@/import/transfers";

const refresh = () => revalidatePath("/", "layout");

// ---------- Imports ----------

export async function uploadFiles(formData: FormData): Promise<ImportOutcome[]> {
  const db = getDb();
  const results: ImportOutcome[] = [];
  for (const entry of formData.getAll("files")) {
    if (!(entry instanceof File)) continue;
    results.push(importFile(db, { fileName: entry.name, content: await entry.text() }));
  }
  refresh();
  return results;
}

export async function assignImportAccount(importId: number, accountId: number): Promise<ImportOutcome> {
  const db = getDb();
  const rec = db.select().from(imports).where(eq(imports.id, importId)).get();
  if (!rec?.content) throw new Error("That import has no stored file");
  const outcome = importFile(db, { fileName: rec.fileName, content: rec.content, accountId, presetId: rec.presetId ?? undefined, importId });
  refresh();
  return outcome;
}

export async function assignImportNewAccount(importId: number, name: string): Promise<ImportOutcome> {
  const db = getDb();
  const rec = db.select().from(imports).where(eq(imports.id, importId)).get();
  if (!rec?.content || !rec.presetId) throw new Error("That import has no stored file");
  const preset = allPresets(db).find((p) => p.id === rec.presetId);
  if (!preset) throw new Error("Unknown file format");
  const account = db.insert(accounts).values({
    name: name.trim() || preset.label,
    institution: preset.institution,
    type: preset.accountType,
    presetId: preset.id,
  }).returning().get();
  const outcome = importFile(db, { fileName: rec.fileName, content: rec.content, accountId: account.id, presetId: preset.id, importId });
  refresh();
  return outcome;
}

export async function saveColumnMapping(importId: number, cfg: CustomPresetConfig): Promise<ImportOutcome> {
  const db = getDb();
  const rec = db.select().from(imports).where(eq(imports.id, importId)).get();
  if (!rec?.content) throw new Error("That import has no stored file");
  if (!cfg.dateColumn || !cfg.descriptionColumn || !(cfg.amountColumn || cfg.debitColumn || cfg.creditColumn)) {
    throw new Error("Pick the date, description and amount columns");
  }
  const id = `custom-${Date.now()}`;
  const config: CustomPresetConfig = { ...cfg, headers: cfg.headers.map(normalizeHeader) };
  db.insert(presets).values({ id, label: cfg.label, config: JSON.stringify(config) }).run();
  const outcome = importFile(db, { fileName: rec.fileName, content: rec.content, presetId: id, importId });
  refresh();
  return outcome;
}

/** Removes everything an import added, so the file can be imported again. */
export async function undoImport(importId: number) {
  const db = getDb();
  db.transaction((tx) => {
    // Unpair anything that was matched against these rows so the other side can re-match.
    const groups = tx.select({ g: transactions.transferGroupId }).from(transactions)
      .where(and(eq(transactions.importId, importId), sql`${transactions.transferGroupId} IS NOT NULL`)).all()
      .map((r) => r.g!);
    if (groups.length) tx.update(transactions).set({ transferGroupId: null }).where(inArray(transactions.transferGroupId, groups)).run();
    const parents = tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.importId, importId)).all().map((r) => r.id);
    if (parents.length) tx.delete(transactions).where(inArray(transactions.parentId, parents)).run();
    tx.delete(transactions).where(eq(transactions.importId, importId)).run();
    tx.delete(imports).where(eq(imports.id, importId)).run();
  });
  reapplyRules(db);
  refresh();
}

export async function dismissImport(importId: number) {
  getDb().delete(imports).where(eq(imports.id, importId)).run();
  refresh();
}

// ---------- Transactions ----------

export interface RuleSuggestion { merchant: string; categoryId: number; categoryName: string; matching: number }

export async function updateTransaction(
  id: number,
  patch: { categoryId?: number | null; kind?: Kind; notes?: string | null },
): Promise<RuleSuggestion | null> {
  const db = getDb();
  const before = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!before) return null;
  if (patch.kind && !KINDS.includes(patch.kind)) throw new Error("Unknown kind");
  const set: Partial<typeof transactions.$inferInsert> = {};
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.categoryId !== undefined || patch.kind !== undefined) set.manual = true;
  db.update(transactions).set(set).where(eq(transactions.id, id)).run();
  refresh();

  // Offer "always categorize <merchant> as <category>" when other rows share the merchant.
  if (patch.categoryId != null && patch.categoryId !== before.categoryId) {
    const matching = db.select({ n: sql<number>`count(*)` }).from(transactions)
      .where(and(eq(transactions.merchant, before.merchant), sql`${transactions.id} <> ${id}`)).get()?.n ?? 0;
    const cat = db.select().from(categories).where(eq(categories.id, patch.categoryId)).get();
    if (cat) return { merchant: before.merchant, categoryId: cat.id, categoryName: cat.name, matching };
  }
  return null;
}

export async function bulkSetCategory(ids: number[], categoryId: number | null) {
  if (!ids.length) return;
  getDb().update(transactions).set({ categoryId, manual: true }).where(inArray(transactions.id, ids)).run();
  refresh();
}

export async function createMerchantRule(merchant: string, categoryId: number, applyToPast: boolean): Promise<number> {
  const db = getDb();
  db.insert(rules).values({ matchField: "merchant", matchType: "equals", pattern: merchant, setCategoryId: categoryId, priority: 100 }).run();
  let changed = 0;
  if (applyToPast) {
    // Hand-edited rows of this merchant get the new category too: the rule is what you just asked for.
    changed = db.update(transactions).set({ categoryId })
      .where(and(eq(transactions.merchant, merchant), sql`${transactions.kind} IN ('expense','refund','income')`)).run().changes;
  }
  refresh();
  return changed;
}

export async function splitTransaction(id: number, parts: { amountCents: number; categoryId: number | null; notes?: string }[]) {
  const db = getDb();
  const parent = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!parent) throw new Error("Transaction not found");
  if (parent.parentId) throw new Error("Split the original transaction, not a part");
  if (parts.length < 2) throw new Error("A split needs at least two parts");
  const sum = parts.reduce((s, p) => s + p.amountCents, 0);
  if (sum !== parent.amountCents) throw new Error("The parts must add up to the original amount");
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.parentId, id)).run();
    for (const p of parts) {
      tx.insert(transactions).values({
        accountId: parent.accountId,
        date: parent.date,
        amountCents: p.amountCents,
        descriptionRaw: parent.descriptionRaw,
        merchant: parent.merchant,
        categoryId: p.categoryId,
        kind: parent.kind,
        bankCategory: parent.bankCategory,
        dedupeKey: null,
        importId: parent.importId,
        parentId: parent.id,
        manual: true,
        notes: p.notes?.trim() || null,
      }).run();
    }
    tx.update(transactions).set({ isSplit: true }).where(eq(transactions.id, id)).run();
  });
  refresh();
}

export async function unsplitTransaction(id: number) {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.parentId, id)).run();
    tx.update(transactions).set({ isSplit: false }).where(eq(transactions.id, id)).run();
  });
  refresh();
}

// ---------- Accounts ----------

export async function updateAccount(id: number, patch: { name?: string; type?: AccountType; last4?: string | null }) {
  if (patch.type && !ACCOUNT_TYPES.includes(patch.type)) throw new Error("Unknown account type");
  const set: Partial<typeof accounts.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name.trim() || "Untitled account";
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.last4 !== undefined) set.last4 = patch.last4?.trim() || null;
  const db = getDb();
  db.update(accounts).set(set).where(eq(accounts.id, id)).run();
  if (patch.type) { reapplyRules(db); matchTransfers(db); }
  refresh();
}

export async function createAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim();
  const type = String(formData.get("type")) as AccountType;
  const presetId = String(formData.get("presetId") ?? "") || null;
  const last4 = String(formData.get("last4") ?? "").trim() || null;
  if (!name || !institution || !ACCOUNT_TYPES.includes(type)) throw new Error("Name, institution and type are required");
  getDb().insert(accounts).values({ name, institution, type, presetId, last4 }).run();
  refresh();
}

export async function deleteAccount(id: number) {
  getDb().delete(accounts).where(eq(accounts.id, id)).run();
  refresh();
}

// ---------- Rules ----------

export async function createRule(formData: FormData) {
  const pattern = String(formData.get("pattern") ?? "").trim();
  if (!pattern) throw new Error("A rule needs a pattern");
  const matchType = String(formData.get("matchType") ?? "contains") as "contains" | "regex" | "equals";
  if (matchType === "regex") new RegExp(pattern); // throws on an invalid pattern
  const num = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v ? Math.round(Number(v) * 100) : null; };
  const categoryId = Number(formData.get("categoryId")) || null;
  const kind = (String(formData.get("kind") ?? "") || null) as Kind | null;
  if (!categoryId && !kind) throw new Error("A rule must set a category or a kind");
  const db = getDb();
  db.insert(rules).values({
    matchField: String(formData.get("matchField") ?? "description") as "description" | "merchant",
    matchType,
    pattern,
    amountMinCents: num("amountMin"),
    amountMaxCents: num("amountMax"),
    accountId: Number(formData.get("accountId")) || null,
    setCategoryId: categoryId,
    setKind: kind,
    priority: Number(formData.get("priority")) || 100,
  }).run();
  if (formData.get("applyNow")) reapplyRules(db);
  refresh();
}

export async function deleteRule(id: number) {
  getDb().delete(rules).where(eq(rules.id, id)).run();
  refresh();
}

export async function runRulesNow(): Promise<number> {
  const changed = reapplyRules(getDb());
  refresh();
  return changed;
}

// ---------- Categories ----------

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("A category needs a name");
  getDb().insert(categories).values({ name, isEssential: formData.get("essential") === "on" }).onConflictDoNothing().run();
  refresh();
}

export async function updateCategory(id: number, patch: { name?: string; isEssential?: boolean }) {
  const set: Partial<typeof categories.$inferInsert> = {};
  if (patch.name?.trim()) set.name = patch.name.trim();
  if (patch.isEssential !== undefined) set.isEssential = patch.isEssential;
  getDb().update(categories).set(set).where(eq(categories.id, id)).run();
  refresh();
}

const PROTECTED_CATEGORIES = ["Uncategorized", "Transfers", "Investing", "Income"];

export async function deleteCategory(id: number) {
  const db = getDb();
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!cat) return;
  if (PROTECTED_CATEGORIES.includes(cat.name)) throw new Error(`${cat.name} is used by Spendwise itself and can't be deleted`);
  const fallback = db.select().from(categories).where(eq(categories.name, "Uncategorized")).get();
  db.transaction((tx) => {
    tx.update(transactions).set({ categoryId: fallback?.id ?? null }).where(eq(transactions.categoryId, id)).run();
    tx.delete(rules).where(eq(rules.setCategoryId, id)).run();
    tx.delete(categories).where(eq(categories.id, id)).run();
  });
  refresh();
}
