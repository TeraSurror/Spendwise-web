import { describe, expect, it } from "vitest";
import { parseDate } from "../src/lib/dates";
import { parseCents } from "../src/lib/money";
import { cleanMerchant } from "../src/import/normalize";

describe("parseCents", () => {
  it.each([
    ["1,234.56", 123456],
    ["$1,234.56", 123456],
    ["-$1,970.00", -197000],
    ["(12.34)", -1234],
    ["12.34-", -1234],
    ["1000", 100000],
    ["-871.5", -87150],
    ["0.005", 1],
  ])("%s -> %d", (input, cents) => expect(parseCents(input)).toBe(cents));

  it.each(["", "  ", "--", "abc", undefined])("%s -> null", (input) => expect(parseCents(input)).toBeNull());
});

describe("parseDate", () => {
  it.each([
    ["10/02/2026", "2026-10-02"],
    ["1/5/26", "2026-01-05"],
    ["2026-10-02", "2026-10-02"],
    ["10/03/2026 as of 10/02/2026", "2026-10-03"],
  ])("%s -> %s", (input, iso) => expect(parseDate(input)).toBe(iso));

  it.each(["Transactions Total", "02/30/2026", "", "13/01/2026"])("%s -> null", (input) => expect(parseDate(input)).toBeNull());
});

describe("cleanMerchant", () => {
  it.each([
    ["SQ *BLUE BOTTLE COFFEE #123  OAKLAND CA", "Blue Bottle Coffee"],
    ["STARBUCKS STORE 12345", "Starbucks Store"],
    ["AMZN Mktp US*2K4AB12C3", "AMZN Mktp US"],
    ["TRADER JOE'S #123    SAN FRANCISCO       CA", "Trader Joe's"],
    ["DELTA AIR LINES     ATLANTA             GA", "Delta Air Lines"],
    ["NETFLIX.COM", "Netflix.com"],
    ["TST* JOE'S PIZZA", "Joe's Pizza"],
  ])("%s -> %s", (raw, merchant) => expect(cleanMerchant(raw)).toBe(merchant));
});
