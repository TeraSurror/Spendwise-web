import { sql } from "drizzle-orm";
import type { DB } from "./client";
import { categories, rules, type AccountType, type Kind } from "./schema";

export const DEFAULT_CATEGORIES: { name: string; essential?: boolean }[] = [
  { name: "Housing", essential: true },
  { name: "Utilities", essential: true },
  { name: "Groceries", essential: true },
  { name: "Dining" },
  { name: "Transport", essential: true },
  { name: "Shopping" },
  { name: "Subscriptions" },
  { name: "Health", essential: true },
  { name: "Travel" },
  { name: "Entertainment" },
  { name: "Fees" },
  { name: "Gifts" },
  { name: "Income" },
  { name: "Transfers" },
  { name: "Investing" },
  { name: "Uncategorized" },
];

interface DefaultRule {
  pattern: string;
  category?: string;
  kind?: Kind;
  regex?: boolean;
  /** "out" = negative amounts only, "in" = positive only. */
  direction?: "in" | "out";
  accountType?: AccountType;
  /** Higher wins. Specific rules (e.g. "UBER EATS") outrank general ones ("UBER"). */
  priority?: number;
}

const r = (category: string, patterns: string[], extra: Omit<DefaultRule, "pattern" | "category"> = {}) =>
  patterns.map((pattern) => ({ pattern, category, ...extra }));

export const DEFAULT_RULES: DefaultRule[] = [
  // Income
  ...r("Income", ["PAYROLL", "DIRECT DEP", "DIR DEP", "SALARY"], { kind: "income", direction: "in" }),

  // Paying off a card from a bank account
  ...r("Transfers", [
    "PAYMENT TO CHASE CARD", "CHASE CREDIT CRD", "AMERICAN EXPRESS ACH PMT", "AMEX EPAYMENT",
    "CAPITAL ONE MOBILE PMT", "CAPITAL ONE ONLINE PMT", "CAPITAL ONE CRCARDPMT", "CITI AUTOPAY",
    "DISCOVER E-PAYMENT", "APPLECARD GSBANK",
  ], { kind: "card_payment", direction: "out", priority: 30 }),
  // The card side of the same payment
  ...r("Transfers", ["PAYMENT THANK YOU", "AUTOPAY PAYMENT", "ONLINE PAYMENT", "MOBILE PYMT", "AUTOPAY PYMT", "PAYMENT RECEIVED"],
    { kind: "card_payment", direction: "in", accountType: "credit_card", priority: 30 }),

  // Money moving from a bank account into a brokerage (and back)
  ...r("Investing", ["FID BKG SVC", "FIDELITY", "SCHWAB", "VANGUARD"], { kind: "contribution", direction: "out", accountType: "checking", priority: 30 }),
  ...r("Investing", ["FID BKG SVC", "FIDELITY", "SCHWAB", "VANGUARD"], { kind: "withdrawal", direction: "in", accountType: "checking", priority: 30 }),

  // Moving money between your own bank accounts
  ...r("Transfers", ["ONLINE TRANSFER", "TRANSFER TO SAV", "TRANSFER FROM SAV", "TRANSFER TO CHK", "TRANSFER FROM CHK"],
    { kind: "transfer", priority: 20 }),

  ...r("Groceries", ["WHOLE FOODS", "WHOLEFDS", "TRADER JOE", "SAFEWAY", "KROGER", "COSTCO", "ALDI", "PUBLIX", "WEGMANS", "H-E-B", "INSTACART", "SPROUTS"]),
  ...r("Dining", ["UBER EATS", "UBER *EATS"], { priority: 20 }),
  ...r("Dining", ["STARBUCKS", "DOORDASH", "GRUBHUB", "CHIPOTLE", "MCDONALD", "SWEETGREEN", "DUNKIN", "PANERA"]),
  ...r("Transport", ["UBER", "LYFT", "SHELL OIL", "CHEVRON", "EXXON", "MTA", "CLIPPER", "PARKING", "EZPASS", "E-ZPASS"]),
  ...r("Subscriptions", ["AMAZON PRIME", "PRIME VIDEO", "AUDIBLE", "KINDLE UNLTD"], { priority: 20 }),
  ...r("Subscriptions", ["NETFLIX", "SPOTIFY", "HULU", "DISNEY PLUS", "DISNEY+", "APPLE.COM/BILL", "YOUTUBE", "ICLOUD", "OPENAI", "ANTHROPIC", "CLAUDE.AI"]),
  ...r("Shopping", ["AMAZON", "AMZN", "TARGET", "WALMART", "BEST BUY", "IKEA", "HOME DEPOT", "ETSY"]),
  ...r("Utilities", ["COMCAST", "XFINITY", "VERIZON", "AT&T", "T-MOBILE", "PG&E", "CON ED", "ELECTRIC", "WATER UTIL"]),
  ...r("Housing", ["\\bRENT\\b", "MORTGAGE", "HOA\\b"], { regex: true }),
  ...r("Health", ["CVS", "WALGREENS", "PHARMACY", "DENTAL", "MEDICAL"]),
  ...r("Travel", ["AIRBNB", "DELTA AIR", "UNITED AIRLINES", "AMERICAN AIRLINES", "SOUTHWEST", "MARRIOTT", "HILTON", "EXPEDIA"]),
  ...r("Entertainment", ["AMC ", "TICKETMASTER", "STEAMGAMES", "PLAYSTATION"]),
  ...r("Fees", ["LATE FEE", "INTEREST CHARGE", "ANNUAL FEE", "FOREIGN TRANSACTION FEE", "OVERDRAFT", "SERVICE FEE"], { priority: 20 }),
  ...r("Gifts", ["GOFUNDME", "RED CROSS"]),
];

/** Inserts default categories and rules into an empty database. Safe to call on every start. */
export function seed(db: DB) {
  const existing = db.select({ n: sql<number>`count(*)` }).from(categories).get();
  if (existing && existing.n > 0) return;

  db.transaction((tx) => {
    const ids = new Map<string, number>();
    for (const c of DEFAULT_CATEGORIES) {
      const row = tx.insert(categories).values({ name: c.name, isEssential: c.essential ?? false }).returning().get();
      ids.set(c.name, row.id);
    }
    for (const d of DEFAULT_RULES) {
      tx.insert(rules).values({
        matchField: "description",
        matchType: d.regex ? "regex" : "contains",
        pattern: d.pattern,
        amountMinCents: d.direction === "in" ? 1 : null,
        amountMaxCents: d.direction === "out" ? -1 : null,
        accountType: d.accountType ?? null,
        setCategoryId: d.category ? ids.get(d.category)! : null,
        setKind: d.kind ?? null,
        priority: d.priority ?? 10,
        isDefault: true,
      }).run();
    }
  });
}
