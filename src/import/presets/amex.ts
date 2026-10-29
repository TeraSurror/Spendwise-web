import type { Preset } from "../types";
import { compact, last4, parseCents, row } from "./util";

// Amex: Date,Description,Amount — or the extended export with Card Member, Account #,
// Extended Details, Category, ... Charges are POSITIVE in the export, so the sign flips.
export const amex: Preset = {
  id: "amex",
  label: "American Express",
  institution: "Amex",
  accountType: "credit_card",
  requiredHeaders: ["date", "description", "amount"],
  parse: (t) =>
    compact(t.rows.map((r) => {
      const cents = parseCents(r.amount);
      return row(r.date, cents == null ? null : -cents, r.description, {
        bankCategory: r.category || null,
        accountHint: last4(r["account #"]),
      });
    })),
};
