import type { Kind } from "../../db/schema";
import type { Preset } from "../types";
import { compact, parseCents, row } from "./util";

const chaseLast4 = (fileName: string) => fileName.match(/chase(\d{4})/i)?.[1] ?? null;

// Chase checking: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
const CHECKING_TYPE_KIND: Record<string, Kind> = {
  LOAN_PMT: "card_payment",
  ACCT_XFER: "transfer",
};

export const chaseChecking: Preset = {
  id: "chase-checking",
  label: "Chase checking",
  institution: "Chase",
  accountType: "checking",
  requiredHeaders: ["details", "posting date", "description", "amount"],
  last4FromFileName: chaseLast4,
  parse: (t) =>
    compact(t.rows.map((r) =>
      row(r["posting date"], parseCents(r.amount), r.description, {
        kindHint: CHECKING_TYPE_KIND[r.type?.toUpperCase()] ?? null,
        bankCategory: r.type?.toUpperCase() === "FEE_TRANSACTION" ? "Fees" : null,
      }),
    )),
};

// Chase credit card: Transaction Date,Post Date,Description,Category,Type,Amount,Memo
// Purchases are already negative.
const CARD_TYPE_KIND: Record<string, Kind> = {
  payment: "card_payment",
  return: "refund",
};

export const chaseCard: Preset = {
  id: "chase-card",
  label: "Chase credit card",
  institution: "Chase",
  accountType: "credit_card",
  requiredHeaders: ["transaction date", "post date", "description", "category", "type", "amount"],
  last4FromFileName: chaseLast4,
  parse: (t) =>
    compact(t.rows.map((r) =>
      row(r["transaction date"], parseCents(r.amount), r.description, {
        kindHint: CARD_TYPE_KIND[r.type?.toLowerCase()] ?? null,
        bankCategory: r.type?.toLowerCase() === "fee" ? "Fees" : r.category || null,
      }),
    )),
};
