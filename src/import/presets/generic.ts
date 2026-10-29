import type { AccountType } from "../../db/schema";
import type { Preset } from "../types";
import { compact, last4, parseCents, row } from "./util";

/** A column mapping a person saves for a file format Spendwise doesn't know. */
export interface CustomPresetConfig {
  label: string;
  institution: string;
  accountType: AccountType;
  /** Normalized headers that identify this format next time. */
  headers: string[];
  dateColumn: string;
  descriptionColumn: string;
  /** Either one signed amount column... */
  amountColumn?: string;
  /** ...or separate debit/credit columns. */
  debitColumn?: string;
  creditColumn?: string;
  categoryColumn?: string;
  accountColumn?: string;
  /** For exports where purchases are positive (like Amex). */
  invertSign?: boolean;
}

export function customPreset(id: string, cfg: CustomPresetConfig): Preset {
  return {
    id,
    label: cfg.label,
    institution: cfg.institution,
    accountType: cfg.accountType,
    requiredHeaders: cfg.headers,
    parse: (t) =>
      compact(t.rows.map((r) => {
        let amount: number | null;
        if (cfg.amountColumn) {
          amount = parseCents(r[cfg.amountColumn]);
        } else {
          const debit = parseCents(r[cfg.debitColumn ?? ""]) ?? 0;
          const credit = parseCents(r[cfg.creditColumn ?? ""]) ?? 0;
          amount = r[cfg.debitColumn ?? ""] || r[cfg.creditColumn ?? ""] ? credit - Math.abs(debit) : null;
        }
        if (amount != null && cfg.invertSign) amount = -amount;
        return row(r[cfg.dateColumn], amount, r[cfg.descriptionColumn], {
          bankCategory: cfg.categoryColumn ? r[cfg.categoryColumn] || null : null,
          accountHint: cfg.accountColumn ? last4(r[cfg.accountColumn]) : null,
        });
      })),
  };
}
