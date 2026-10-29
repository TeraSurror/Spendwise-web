import type { Preset } from "../types";
import { brokerageKind, compact, last4, parseCents, row } from "./util";

// Fidelity "Accounts_History.csv": a preamble, then
// Run Date,[Account,Account Number,]Action,Symbol,Description,Type,...,Amount ($),...,Settlement Date
// then a disclaimer footer.
const FIDELITY_TRANSFER = /ELECTRONIC FUNDS TRANSFER|\bEFT\b|DIRECT DEPOSIT|DIRECT DEBIT|CHECK RECEIVED|CHECK PAID|CONTRIBUTION|DISTRIBUTION|TRANSFERRED (FROM|TO)|WIRE TRANS|MONEYLINE|PARTIC CONTR|DEPOSIT|WITHDRAWAL/i;
const FIDELITY_INTERNAL = /CORE ACCOUNT|SWEEP|DIVIDEND|REINVEST|YOU BOUGHT|YOU SOLD|INTEREST/i;

export const fidelity: Preset = {
  id: "fidelity",
  label: "Fidelity",
  institution: "Fidelity",
  accountType: "brokerage",
  requiredHeaders: ["run date", "action", "amount"],
  parse: (t) =>
    compact(t.rows.map((r) => {
      const amount = parseCents(r.amount);
      const action = r.action ?? "";
      const description = r.symbol ? `${action} (${r.symbol})` : action;
      return row(r["run date"], amount, description, {
        kindHint: amount == null ? null : brokerageKind(action, amount, FIDELITY_TRANSFER, FIDELITY_INTERNAL),
        accountHint: last4(r["account number"]) ?? null,
      });
    })),
};

// Schwab: Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
// Dates can read "10/02/2026 as of 09/30/2026"; amounts carry "$" and commas.
const SCHWAB_TRANSFER = /MONEYLINK|FUNDS RECEIVED|WIRE|JOURNAL|DEPOSIT|WITHDRAWAL|\bACH\b|TRANSFER/i;

export const schwab: Preset = {
  id: "schwab",
  label: "Charles Schwab",
  institution: "Schwab",
  accountType: "brokerage",
  requiredHeaders: ["date", "action", "amount", "fees & comm"],
  parse: (t) =>
    compact(t.rows.map((r) => {
      const amount = parseCents(r.amount);
      const action = r.action ?? "";
      const description = [action, r.symbol, r.description].filter(Boolean).join(" · ");
      return row(r.date, amount, description, {
        kindHint: amount == null ? null : brokerageKind(action, amount, SCHWAB_TRANSFER),
      });
    })),
};

// Vanguard "OfxDownload.csv": a holdings section, a blank line, then
// Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commission Fees,Net Amount,...
const VANGUARD_TRANSFER = /FUNDS RECEIVED|WITHDRAWAL|TRANSFER \((INCOMING|OUTGOING)\)|CONTRIBUTION|DISTRIBUTION|ELECTRONIC BANK TRANSFER|DEPOSIT|ROLLOVER/i;
const VANGUARD_INTERNAL = /SWEEP|CONVERSION/i;

export const vanguard: Preset = {
  id: "vanguard",
  label: "Vanguard",
  institution: "Vanguard",
  accountType: "brokerage",
  requiredHeaders: ["trade date", "transaction type", "net amount"],
  parse: (t) =>
    compact(t.rows.map((r) => {
      const amount = parseCents(r["net amount"]);
      const type = r["transaction type"] ?? "";
      const description = [type, r["transaction description"], r.symbol].filter(Boolean).join(" · ");
      return row(r["trade date"], amount, description, {
        kindHint: amount == null ? null : brokerageKind(type, amount, VANGUARD_TRANSFER, VANGUARD_INTERNAL),
        accountHint: last4(r["account number"]),
      });
    })),
};
