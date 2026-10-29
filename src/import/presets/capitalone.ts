import type { Preset } from "../types";
import { compact, last4, parseCents, row } from "./util";

// Capital One card: Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
export const capitalOneCard: Preset = {
  id: "capitalone-card",
  label: "Capital One credit card",
  institution: "Capital One",
  accountType: "credit_card",
  requiredHeaders: ["transaction date", "posted date", "card no.", "description", "debit", "credit"],
  parse: (t) =>
    compact(t.rows.map((r) => {
      const debit = parseCents(r.debit) ?? 0;
      const credit = parseCents(r.credit) ?? 0;
      const amount = r.debit || r.credit ? credit - debit : null;
      const isPayment = /payment\/credit/i.test(r.category ?? "") && amount != null && amount > 0 && /PYMT|PAYMENT/i.test(r.description ?? "");
      return row(r["transaction date"], amount, r.description, {
        bankCategory: r.category || null,
        kindHint: isPayment ? "card_payment" : null,
        accountHint: last4(r["card no."]),
      });
    })),
};

// Capital One 360 checking/savings: Account Number,Transaction Date,Transaction Amount,Transaction Type,Transaction Description,Balance
export const capitalOneBank: Preset = {
  id: "capitalone-bank",
  label: "Capital One 360 checking",
  institution: "Capital One",
  accountType: "checking",
  requiredHeaders: ["transaction date", "transaction amount", "transaction type", "transaction description"],
  parse: (t) =>
    compact(t.rows.map((r) => {
      let amount = parseCents(r["transaction amount"]);
      if (amount != null && /debit/i.test(r["transaction type"] ?? "") && amount > 0) amount = -amount;
      return row(r["transaction date"], amount, r["transaction description"], {
        accountHint: last4(r["account number"]),
      });
    })),
};
