import Papa from "papaparse";
import type { Table } from "./types";

export function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, "").trim().toLowerCase().replace(/\s*\(\$\)\s*$/, "").replace(/\s+/g, " ");
}

export function readCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  return result.data;
}

const isBlank = (row: string[]) => row.every((c) => !c || !c.trim());

/**
 * Finds the first row containing every required header and returns the rows under it,
 * stopping at the first blank line. This skips preambles (Fidelity, Schwab), footers and
 * earlier sections (Vanguard's holdings block comes before its transactions).
 */
export function findTable(cells: string[][], required: string[]): Table | null {
  for (let i = 0; i < cells.length; i++) {
    const headers = cells[i].map(normalizeHeader);
    if (!required.every((r) => headers.includes(r))) continue;
    const rows: Record<string, string>[] = [];
    for (let j = i + 1; j < cells.length; j++) {
      const row = cells[j];
      if (isBlank(row)) {
        if (rows.length) break;
        continue;
      }
      const rec: Record<string, string> = {};
      headers.forEach((h, k) => { if (h) rec[h] = (row[k] ?? "").trim(); });
      rows.push(rec);
    }
    return { headers: headers.filter(Boolean), rows };
  }
  return null;
}
