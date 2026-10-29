import type { AccountType, Kind, Rule } from "../db/schema";

export interface ClassifyInput {
  description: string;
  merchant: string;
  amountCents: number;
  bankCategory?: string | null;
  kindHint?: Kind | null;
}

export interface ClassifyContext {
  rules: Rule[];
  categoryIds: Map<string, number>;
  accountId: number;
  accountType: AccountType;
}

/** Kinds that move money between your own accounts and never count as spending. */
export const NON_SPENDING_KINDS: Kind[] = ["transfer", "card_payment", "contribution", "withdrawal", "investment_internal"];

const KIND_CATEGORY: Partial<Record<Kind, string>> = {
  transfer: "Transfers",
  card_payment: "Transfers",
  contribution: "Investing",
  withdrawal: "Investing",
  investment_internal: "Investing",
  income: "Income",
};

// Bank-supplied categories (Chase, Capital One, Amex extended) mapped onto ours. Order matters.
const BANK_CATEGORY_MAP: [RegExp, string][] = [
  [/grocer/i, "Groceries"],
  [/food|dining|restaurant|drink/i, "Dining"],
  [/travel|airfare|airline|lodging|hotel/i, "Travel"],
  [/gas|automotive|transport|taxi|parking|car rental/i, "Transport"],
  [/bills|utilit|phone|cable|internet/i, "Utilities"],
  [/entertainment/i, "Entertainment"],
  [/health|medical|pharmac/i, "Health"],
  [/shopping|merchandise/i, "Shopping"],
  [/\bhome\b|rent/i, "Housing"],
  [/fee|interest/i, "Fees"],
  [/gift|donation|charit/i, "Gifts"],
];

export function mapBankCategory(bankCategory: string | null | undefined): string | null {
  if (!bankCategory) return null;
  return BANK_CATEGORY_MAP.find(([re]) => re.test(bankCategory))?.[1] ?? null;
}

const regexCache = new Map<string, RegExp | null>();
function compile(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try { regexCache.set(pattern, new RegExp(pattern, "i")); } catch { regexCache.set(pattern, null); }
  }
  return regexCache.get(pattern)!;
}

export function ruleMatches(rule: Rule, tx: ClassifyInput, accountId: number, accountType: AccountType): boolean {
  if (rule.accountId != null && rule.accountId !== accountId) return false;
  if (rule.accountType != null && rule.accountType !== accountType) return false;
  if (rule.amountMinCents != null && tx.amountCents < rule.amountMinCents) return false;
  if (rule.amountMaxCents != null && tx.amountCents > rule.amountMaxCents) return false;
  // Exports pad descriptions with runs of spaces ("UBER   *EATS"), so compare collapsed text.
  const value = (rule.matchField === "merchant" ? tx.merchant : tx.description).replace(/\s+/g, " ");
  switch (rule.matchType) {
    case "equals": return value.toLowerCase() === rule.pattern.toLowerCase();
    case "regex": return compile(rule.pattern)?.test(value) ?? false;
    default: return value.toLowerCase().includes(rule.pattern.toLowerCase());
  }
}

/** Your rules first, then seeded defaults; higher priority first within each. */
export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) =>
    Number(a.isDefault) - Number(b.isDefault) || b.priority - a.priority || a.id - b.id);
}

/**
 * Decides a transaction's kind and category.
 * Kind: the file's own hint, unless one of your rules says otherwise; then default rules; then sign + account type.
 * Category: your rules, default rules, the bank's category, then Uncategorized.
 * Money moving between your accounts always lands in Transfers/Investing unless your rule says otherwise.
 */
export function classify(tx: ClassifyInput, ctx: ClassifyContext): { kind: Kind; categoryId: number | null } {
  let kind: Kind | null = tx.kindHint ?? null;
  let kindFromRule = false;
  let category: number | null = null;
  let categoryFromUser = false;

  for (const rule of ctx.rules) {
    if (kindFromRule && category != null) break;
    if (!ruleMatches(rule, tx, ctx.accountId, ctx.accountType)) continue;
    // A default rule never overrides what the file itself says; your rules can.
    if (rule.setKind && !kindFromRule && (!rule.isDefault || kind == null)) {
      kind = rule.setKind;
      kindFromRule = true;
    }
    if (rule.setCategoryId != null && category == null) {
      category = rule.setCategoryId;
      categoryFromUser = !rule.isDefault;
    }
  }

  const cat = (name: string) => ctx.categoryIds.get(name) ?? null;

  if (kind == null) {
    if (ctx.accountType === "brokerage") kind = "investment_internal";
    else if (tx.amountCents < 0) kind = "expense";
    else if (ctx.accountType === "credit_card") kind = "refund";
    else if (category != null && category !== cat("Income")) kind = "refund"; // money back from a known merchant
    else kind = "income";
  }

  const forced = KIND_CATEGORY[kind];
  if (forced && kind !== "income" && !categoryFromUser) category = cat(forced);
  if (category == null && kind === "income") category = cat("Income");
  if (category == null) {
    const mapped = mapBankCategory(tx.bankCategory);
    category = mapped ? cat(mapped) : null;
  }
  return { kind, categoryId: category ?? cat("Uncategorized") };
}
