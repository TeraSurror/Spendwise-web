import { describe, expect, it } from "vitest";
import { detectPreset } from "../src/import/pipeline";
import { FIXTURES, fixture, freshDb } from "./helpers";

function parse(name: string) {
  const db = freshDb();
  const detected = detectPreset(db, fixture(name));
  expect(detected).not.toBeNull();
  return { id: detected!.preset.id, rows: detected!.preset.parse(detected!.table) };
}

describe("built-in presets", () => {
  it("Chase checking keeps signs and flags card payments", () => {
    const { id, rows } = parse(FIXTURES.chaseChecking);
    expect(id).toBe("chase-checking");
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ date: "2026-10-01", amountCents: 420000 });
    expect(rows[1]).toMatchObject({ amountCents: -125040, kindHint: "card_payment" });
    expect(rows[5]).toMatchObject({ amountCents: -1200, bankCategory: "Fees" });
  });

  it("Chase card marks payments and returns", () => {
    const { id, rows } = parse(FIXTURES.chaseCard);
    expect(id).toBe("chase-card");
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ date: "2026-10-01", amountCents: -645, bankCategory: "Food & Drink", kindHint: null });
    expect(rows.find((r) => r.kindHint === "refund")).toMatchObject({ amountCents: 4599 });
    expect(rows.find((r) => r.kindHint === "card_payment")).toMatchObject({ amountCents: 125040 });
  });

  it("Amex flips the sign", () => {
    const { id, rows } = parse(FIXTURES.amex);
    expect(id).toBe("amex");
    expect(rows.map((r) => r.amountCents)).toEqual([-5678, -41230, 30000, -525]);
  });

  it("Capital One combines debit and credit columns and reads the card number", () => {
    const { id, rows } = parse(FIXTURES.capitalOne);
    expect(id).toBe("capitalone-card");
    expect(rows.map((r) => r.amountCents)).toEqual([-2340, -1199, 20000, -6410]);
    expect(rows[2].kindHint).toBe("card_payment");
    expect(rows.every((r) => r.accountHint === "4321")).toBe(true);
  });

  it("Fidelity skips the preamble and footer and classifies cash movements", () => {
    const { id, rows } = parse(FIXTURES.fidelity);
    expect(id).toBe("fidelity");
    expect(rows.map((r) => [r.amountCents, r.kindHint])).toEqual([
      [100000, "contribution"],
      [-87150, "investment_internal"],
      [412, "investment_internal"],
      [-20000, "withdrawal"],
    ]);
  });

  it("Schwab handles $ amounts, 'as of' dates and the totals footer", () => {
    const { id, rows } = parse(FIXTURES.schwab);
    expect(id).toBe("schwab");
    expect(rows.map((r) => [r.date, r.amountCents, r.kindHint])).toEqual([
      ["2026-10-02", 250000, "contribution"],
      ["2026-10-03", -197000, "investment_internal"],
      ["2026-10-15", 1230, "investment_internal"],
      ["2026-10-22", -30000, "withdrawal"],
    ]);
  });

  it("Vanguard reads the transactions section, not the holdings section", () => {
    const { id, rows } = parse(FIXTURES.vanguard);
    expect(id).toBe("vanguard");
    expect(rows.map((r) => [r.amountCents, r.kindHint])).toEqual([
      [75000, "contribution"],
      [-58100, "investment_internal"],
      [0, "investment_internal"],
      [340, "investment_internal"],
    ]);
    expect(rows[0].accountHint).toBe("1122");
  });

  it("returns null for a format it doesn't know", () => {
    expect(detectPreset(freshDb(), fixture(FIXTURES.unknown))).toBeNull();
  });
});
