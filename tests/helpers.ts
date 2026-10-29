import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db/client";

export const fixture = (name: string) => fs.readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

export const freshDb = () => openDb(":memory:");

export const FIXTURES = {
  chaseChecking: "Chase1234_Activity_20261028.CSV",
  chaseCard: "Chase5678_Activity20261028.CSV",
  chaseCardLater: "Chase5678_Activity20261031.CSV",
  amex: "amex-activity.csv",
  capitalOne: "capitalone-transactions.csv",
  fidelity: "Accounts_History.csv",
  schwab: "Individual_XXX987_Transactions_20261028.csv",
  vanguard: "OfxDownload.csv",
  unknown: "mystery-bank.csv",
};
