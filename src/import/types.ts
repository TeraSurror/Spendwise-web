import type { AccountType, Kind } from "../db/schema";

/** A CSV section with normalized (lowercased, trimmed) header names as row keys. */
export interface Table {
  headers: string[];
  rows: Record<string, string>[];
}

/** One transaction as read from a file, before it is tied to an account. */
export interface ParsedRow {
  date: string;
  amountCents: number;
  description: string;
  bankCategory?: string | null;
  /** Set when the file itself says what the row is (a card payment, a brokerage deposit...). */
  kindHint?: Kind | null;
  /** Card number, last4 or account number from the file, when it has one. */
  accountHint?: string | null;
}

export interface Preset {
  id: string;
  label: string;
  institution: string;
  accountType: AccountType;
  /** Normalized header names that must all appear on one row for the file to match. */
  requiredHeaders: string[];
  parse(table: Table): ParsedRow[];
  /** Pulls an account's last4 out of the export's file name, e.g. Chase's "Chase1234_Activity...". */
  last4FromFileName?(fileName: string): string | null;
}
