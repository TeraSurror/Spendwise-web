import type { Kind } from "../../db/schema";
import { parseDate } from "../../lib/dates";
import { parseCents } from "../../lib/money";
import type { ParsedRow } from "../types";

/** Builds a ParsedRow, or null when the line has no usable date or amount (footers, pending rows). */
export function row(
  date: string | undefined,
  amountCents: number | null,
  description: string | undefined,
  extra: Omit<ParsedRow, "date" | "amountCents" | "description"> = {},
): ParsedRow | null {
  const d = parseDate(date);
  if (!d || amountCents == null || !description?.trim()) return null;
  return { date: d, amountCents, description: description.trim(), ...extra };
}

export const compact = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x != null);

export { parseCents };

/**
 * Brokerage activity is either cash crossing the account boundary (a contribution or
 * withdrawal, depending on sign) or activity inside the account (buys, sells, dividends).
 */
export function brokerageKind(action: string, amountCents: number, transfer: RegExp, internal?: RegExp): Kind {
  if (amountCents === 0 || internal?.test(action) || !transfer.test(action)) return "investment_internal";
  return amountCents > 0 ? "contribution" : "withdrawal";
}

export const last4 = (s: string | undefined | null) => {
  const digits = (s ?? "").replace(/\D/g, "");
  return digits.length ? digits.slice(-4) : null;
};
