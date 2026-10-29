import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { DB } from "../src/db/client";
import { accounts, categories, rules, transactions } from "../src/db/schema";
import { importFile, reapplyRules } from "../src/import/pipeline";
import { investedByAccount, investedTotals, monthSummary, spendingByCategory } from "../src/lib/queries";
import { FIXTURES, fixture, freshDb } from "./helpers";

const load = (db: DB, name: string, extra: { accountId?: number; importId?: number } = {}) =>
  importFile(db, { fileName: name, content: fixture(name), ...extra });

function loadAll(db: DB) {
  for (const name of [FIXTURES.chaseChecking, FIXTURES.chaseCard, FIXTURES.amex, FIXTURES.capitalOne, FIXTURES.fidelity, FIXTURES.schwab, FIXTURES.vanguard]) {
    expect(load(db, name).status).toBe("imported");
  }
}

const txByDescription = (db: DB, text: string) =>
  db.select().from(transactions).all().filter((t) => t.descriptionRaw.includes(text));

describe("dedupe", () => {
  it("skips a file it has already imported", () => {
    const db = freshDb();
    expect(load(db, FIXTURES.chaseCard)).toMatchObject({ status: "imported", inserted: 10 });
    expect(load(db, FIXTURES.chaseCard)).toMatchObject({ status: "duplicate_file", inserted: 0 });
    expect(db.select().from(transactions).all()).toHaveLength(10);
  });

  it("adds only new rows from an overlapping export, and keeps identical same-day purchases", () => {
    const db = freshDb();
    load(db, FIXTURES.chaseCard);
    expect(txByDescription(db, "STARBUCKS STORE")).toHaveLength(2);
    const later = load(db, FIXTURES.chaseCardLater);
    expect(later).toMatchObject({ status: "imported", inserted: 1, duplicates: 2 });
    expect(db.select().from(transactions).all()).toHaveLength(11);
  });

  it("re-importing the same rows with different bytes adds nothing", () => {
    const db = freshDb();
    load(db, FIXTURES.chaseCard);
    const outcome = importFile(db, { fileName: "Chase5678_copy.CSV", content: fixture(FIXTURES.chaseCard) + "\n" });
    expect(outcome).toMatchObject({ status: "imported", inserted: 0, duplicates: 10 });
  });
});

describe("accounts", () => {
  it("creates accounts from file names and card numbers", () => {
    const db = freshDb();
    loadAll(db);
    const names = db.select().from(accounts).all().map((a) => a.name).sort();
    expect(names).toEqual([
      "Amex Card",
      "Capital One Card ••4321",
      "Chase Card ••5678",
      "Chase Checking ••1234",
      "Fidelity Brokerage",
      "Schwab Brokerage",
      "Vanguard Brokerage ••1122",
    ]);
  });

  it("asks which account when two of the same kind exist and the file doesn't say", () => {
    const db = freshDb();
    db.insert(accounts).values([
      { name: "Amex Gold", institution: "Amex", type: "credit_card", presetId: "amex" },
      { name: "Amex Blue", institution: "Amex", type: "credit_card", presetId: "amex" },
    ]).run();
    const first = load(db, FIXTURES.amex);
    expect(first.status).toBe("needs_account");
    const gold = db.select().from(accounts).where(eq(accounts.name, "Amex Gold")).get()!;
    const resolved = load(db, FIXTURES.amex, { accountId: gold.id, importId: first.importId });
    expect(resolved).toMatchObject({ status: "imported", inserted: 4, importId: first.importId });
  });

  it("leaves an unknown format for column mapping", () => {
    const db = freshDb();
    expect(load(db, FIXTURES.unknown).status).toBe("unrecognized");
  });
});

describe("classification and transfers", () => {
  it("categorizes with default rules and bank categories", () => {
    const db = freshDb();
    loadAll(db);
    const catName = new Map(db.select().from(categories).all().map((c) => [c.id, c.name]));
    const cat = (text: string) => catName.get(txByDescription(db, text)[0].categoryId!);
    expect(cat("UBER   *EATS")).toBe("Dining");
    expect(cat("UBER   *TRIP")).toBe("Transport");
    expect(cat("NETFLIX")).toBe("Subscriptions");
    expect(cat("WHOLEFDS")).toBe("Groceries");
    expect(cat("LANDLORD LLC RENT")).toBe("Housing");
    expect(cat("MONTHLY SERVICE FEE")).toBe("Fees");
    expect(cat("LOCAL BOOKSHOP")).toBe("Shopping"); // from Chase's own category
    expect(cat("PAYROLL")).toBe("Income");
  });

  it("pairs card payments and brokerage deposits so they aren't spending", () => {
    const db = freshDb();
    loadAll(db);
    const [bankSide] = txByDescription(db, "Payment to Chase card");
    const [cardSide] = txByDescription(db, "Payment Thank You-Mobile");
    expect(bankSide.kind).toBe("card_payment");
    expect(cardSide.kind).toBe("card_payment");
    expect(bankSide.transferGroupId).toBeTruthy();
    expect(bankSide.transferGroupId).toBe(cardSide.transferGroupId);

    const [moneyline] = txByDescription(db, "FID BKG SVC");
    const [fidelityIn] = txByDescription(db, "ELECTRONIC FUNDS TRANSFER RECEIVED");
    expect(moneyline.kind).toBe("transfer");
    expect(fidelityIn.kind).toBe("contribution");
    expect(moneyline.transferGroupId).toBe(fidelityIn.transferGroupId);
  });

  it("counts a bank-side brokerage deposit as invested until the brokerage file arrives", () => {
    const db = freshDb();
    load(db, FIXTURES.chaseChecking);
    expect(investedTotals(db, "2026-10-29").allTime).toBe(100000);
    load(db, FIXTURES.fidelity);
    // Matched now: the $1,000 is counted once, on the Fidelity side, less the $200 withdrawal.
    expect(investedTotals(db, "2026-10-29").allTime).toBe(80000);
  });

  it("a rule you add re-categorizes past transactions", () => {
    const db = freshDb();
    load(db, FIXTURES.chaseCard);
    const gifts = db.select().from(categories).where(eq(categories.name, "Gifts")).get()!;
    db.insert(rules).values({ matchField: "merchant", matchType: "equals", pattern: "Local Bookshop", setCategoryId: gifts.id }).run();
    expect(reapplyRules(db)).toBe(1);
    expect(txByDescription(db, "LOCAL BOOKSHOP")[0].categoryId).toBe(gifts.id);
  });
});

describe("totals", () => {
  it("matches hand-computed October numbers", () => {
    const db = freshDb();
    loadAll(db);
    load(db, FIXTURES.chaseCardLater);
    const oct = monthSummary(db, "2026-10");
    // Chase card 233.56 + Chase checking 2,201.99 + Amex 474.33 + Capital One 99.49
    expect(oct.spending).toBe(300937);
    expect(oct.income).toBe(420000);
    // Fidelity 1,000 - 200, Schwab 2,500 - 300, Vanguard 750
    expect(oct.invested).toBe(375000);

    const totals = investedTotals(db, "2026-10-29");
    expect(totals).toMatchObject({ thisMonth: 375000, ytd: 375000, allTime: 375000, contributed: 425000, withdrawn: 50000 });
    expect(investedByAccount(db, "2026-10-29").map((a) => [a.account, a.net])).toEqual([
      ["Schwab Brokerage", 220000],
      ["Fidelity Brokerage", 80000],
      ["Vanguard Brokerage ••1122", 75000],
    ]);

    const housing = spendingByCategory(db, "2026-10-01", "2026-10-31").find((c) => c.category === "Housing");
    expect(housing?.cents).toBe(210000);
  });
});
