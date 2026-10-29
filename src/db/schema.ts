import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { ACCOUNT_TYPES, KINDS } from "./enums";

export { ACCOUNT_TYPES, KINDS, type AccountType, type Kind } from "./enums";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`);

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  institution: text("institution").notNull(),
  type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
  last4: text("last4"),
  presetId: text("preset_id"),
  createdAt: createdAt(),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id"),
  isEssential: integer("is_essential", { mode: "boolean" }).notNull().default(false),
});

export const imports = sqliteTable("imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  fileSha256: text("file_sha256").notNull(),
  presetId: text("preset_id"),
  accountId: integer("account_id"),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsInserted: integer("rows_inserted").notNull().default(0),
  rowsDuplicate: integer("rows_duplicate").notNull().default(0),
  // imported | duplicate_file | unrecognized | needs_account | error
  status: text("status").notNull(),
  error: text("error"),
  // Raw CSV kept so an unrecognized or ambiguous file can be resolved from the UI.
  content: text("content"),
  createdAt: createdAt(),
}, (t) => [index("imports_sha_idx").on(t.fileSha256)]);

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  descriptionRaw: text("description_raw").notNull(),
  merchant: text("merchant").notNull(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  kind: text("kind", { enum: KINDS }).notNull(),
  bankCategory: text("bank_category"),
  // Null for split children; they never take part in dedupe.
  dedupeKey: text("dedupe_key"),
  importId: integer("import_id"),
  transferGroupId: text("transfer_group_id"),
  // A split parent stays for dedupe but is left out of every total.
  parentId: integer("parent_id"),
  isSplit: integer("is_split", { mode: "boolean" }).notNull().default(false),
  // True once a person edits category/kind, so re-running rules leaves the row alone.
  manual: integer("manual", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [
  index("tx_account_date_idx").on(t.accountId, t.date),
  index("tx_dedupe_idx").on(t.dedupeKey),
  index("tx_date_idx").on(t.date),
]);

export const MATCH_FIELDS = ["merchant", "description"] as const;
export const MATCH_TYPES = ["contains", "regex", "equals"] as const;

export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchField: text("match_field", { enum: MATCH_FIELDS }).notNull().default("description"),
  matchType: text("match_type", { enum: MATCH_TYPES }).notNull().default("contains"),
  pattern: text("pattern").notNull(),
  amountMinCents: integer("amount_min_cents"),
  amountMaxCents: integer("amount_max_cents"),
  accountId: integer("account_id"),
  accountType: text("account_type", { enum: ACCOUNT_TYPES }),
  setCategoryId: integer("set_category_id"),
  setKind: text("set_kind", { enum: KINDS }),
  priority: integer("priority").notNull().default(100),
  // Seeded rules rank below anything a person creates.
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const presets = sqliteTable("presets", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  // JSON-encoded CustomPresetConfig (see src/import/presets/generic.ts)
  config: text("config").notNull(),
  createdAt: createdAt(),
});

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type ImportRecord = typeof imports.$inferSelect;
